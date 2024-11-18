import React, { createContext, useContext, useState, useEffect, useMemo } from "react";
import storage from "./Functions/Storage";
import {
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
  orderBy,
} from "firebase/firestore";
import { db } from "../env/firebaseConfig";

// Constants for retry logic
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // 2 seconds
const ROOM_SYNC_INTERVAL = 60000; // 1 minute

const MessagesContext = createContext();

// Utility function for retrying operations
const withRetry = async (operation, operationName, maxRetries = MAX_RETRIES) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await operation();
      if (attempt > 1) {
        console.log(`[Messages] ${operationName} succeeded on attempt ${attempt}`);
      }
      return result;
    } catch (error) {
      console.error(
        `[Messages] Attempt ${attempt}/${maxRetries} failed for ${operationName}:`,
        error
      );
      if (attempt === maxRetries) throw error;
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt));
    }
  }
};

// Logger utility
const logger = {
  info: (message, data) => console.log(`[Messages] ${message}`, data || ''),
  error: (message, error) => console.error(`[Messages] ${message}:`, error),
  warn: (message, data) => console.warn(`[Messages] ${message}`, data || ''),
  debug: (message, data) => console.debug(`[Messages] ${message}`, data || '')
};

export const MessagesProvider = ({ children }) => {
  const [roomsMessages, setRoomsMessages] = useState({});
  const [userRooms, setUserRooms] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [roomSubscriptions, setRoomSubscriptions] = useState({});
  const [lastSync, setLastSync] = useState(null);

  // Enhanced user details fetching
  const getUserDetails = async () => {
    try {
      const userData = storage.getString("user_data");
      if (userData) {
        const parsedUser = JSON.parse(userData);
        logger.info("User details loaded", parsedUser.username);
        setUser(parsedUser);
        return parsedUser;
      }
    } catch (error) {
      logger.error("Failed to load user details", error);
    }
    return null;
  };

  // Enhanced room fetching with real-time updates
  const setupRoomsListener = async (userId) => {
    if (!userId) return null;

    logger.info("Setting up rooms listener for user", userId);
    const roomsRef = collection(db, "rooms");
    const q = query(
      roomsRef,
      where("participants", "array-contains", userId)
    );

    return onSnapshot(q, 
      (snapshot) => {
        const rooms = snapshot.docs.map(doc => ({
          roomId: doc.id,
          ...doc.data(),
        }));
        logger.info("Rooms updated", { count: rooms.length });
        setUserRooms(rooms);
        
        // Setup message listeners for new rooms
        rooms.forEach(room => {
          if (!roomSubscriptions[room.roomId]) {
            setupMessageListener(room.roomId);
          }
        });

        // Cleanup listeners for removed rooms
        Object.keys(roomSubscriptions).forEach(roomId => {
          if (!rooms.find(room => room.roomId === roomId)) {
            cleanupRoomSubscription(roomId);
          }
        });
      },
      (error) => {
        logger.error("Rooms listener error", error);
        // Attempt to reestablish connection after delay
        setTimeout(() => setupRoomsListener(userId), RETRY_DELAY);
      }
    );
  };

  // Enhanced message listener setup
  const setupMessageListener = async (roomId) => {
    if (roomSubscriptions[roomId]) return;

    logger.info("Setting up message listener for room", roomId);
    const messagesRef = collection(db, "rooms", roomId, "messages");
    const q = query(messagesRef, orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === "added" || change.type === "modified") {
            const message = { id: change.doc.id, ...change.doc.data() };
            
            setRoomsMessages(prev => {
              const updatedMessages = [...(prev[roomId] || [])];
              const existingIndex = updatedMessages.findIndex(
                msg => msg.id === message.id
              );

              if (existingIndex >= 0) {
                updatedMessages[existingIndex] = message;
              } else {
                updatedMessages.push(message);
              }

              // Sort messages by timestamp
              updatedMessages.sort((a, b) => a.createdAt - b.createdAt);
              
              return {
                ...prev,
                [roomId]: updatedMessages,
              };
            });

            // Cache updates
            handleMessageCache(roomId);
          }
        });
      },
      (error) => {
        logger.error(`Message listener error for room ${roomId}`, error);
        // Cleanup and retry
        cleanupRoomSubscription(roomId);
        setTimeout(() => setupMessageListener(roomId), RETRY_DELAY);
      }
    );

    setRoomSubscriptions(prev => ({
      ...prev,
      [roomId]: unsubscribe
    }));
  };

  // Enhanced caching with debouncing
  const handleMessageCache = useMemo(() => {
    const timeouts = {};
    
    return (roomId) => {
      if (timeouts[roomId]) {
        clearTimeout(timeouts[roomId]);
      }

      timeouts[roomId] = setTimeout(() => {
        const messages = roomsMessages[roomId];
        if (messages?.length) {
          try {
            storage.set(`messages_${roomId}`, JSON.stringify(messages));
            logger.debug(`Cached ${messages.length} messages for room ${roomId}`);
          } catch (error) {
            logger.error(`Failed to cache messages for room ${roomId}`, error);
          }
        }
      }, 1000); // Debounce for 1 second
    };
  }, [roomsMessages]);

  // Cleanup function for room subscriptions
  const cleanupRoomSubscription = (roomId) => {
    if (roomSubscriptions[roomId]) {
      roomSubscriptions[roomId]();
      setRoomSubscriptions(prev => {
        const updated = { ...prev };
        delete updated[roomId];
        return updated;
      });
      logger.info("Cleaned up subscription for room", roomId);
    }
  };

  // Initialize everything
  useEffect(() => {
    let roomsUnsubscribe = null;

    const initialize = async () => {
      setIsLoading(true);
      try {
        const userData = await withRetry(
          getUserDetails,
          "Get user details"
        );

        if (userData?.uid) {
          // Setup rooms listener
          roomsUnsubscribe = await withRetry(
            () => setupRoomsListener(userData.uid),
            "Setup rooms listener"
          );

          // Load cached messages
          const rooms = await withRetry(
            () => getDocs(query(
              collection(db, "rooms"),
              where("participants", "array-contains", userData.uid)
            )),
            "Initial rooms fetch"
          );

          rooms.docs.forEach(doc => {
            const cachedMessages = storage.getString(`messages_${doc.id}`);
            if (cachedMessages) {
              setRoomsMessages(prev => ({
                ...prev,
                [doc.id]: JSON.parse(cachedMessages)
              }));
            }
          });
        }
      } catch (error) {
        logger.error("Initialization failed", error);
      } finally {
        setIsLoading(false);
      }
    };

    initialize();

    // Cleanup
    return () => {
      if (roomsUnsubscribe) roomsUnsubscribe();
      Object.keys(roomSubscriptions).forEach(cleanupRoomSubscription);
    };
  }, []);

  // Periodic sync check
  useEffect(() => {
    const syncInterval = setInterval(() => {
      const now = Date.now();
      if (lastSync && (now - lastSync > ROOM_SYNC_INTERVAL)) {
        logger.info("Performing periodic sync check");
        if (user?.uid) {
          setupRoomsListener(user.uid);
        }
        setLastSync(now);
      }
    }, ROOM_SYNC_INTERVAL);

    return () => clearInterval(syncInterval);
  }, [lastSync, user]);

  const value = {
    roomsMessages,
    isLoading,
    userRooms,
    initializeMessages: async () => {
      logger.info("Manual refresh requested");
      if (user?.uid) {
        await setupRoomsListener(user.uid);
      }
    },
  };

  return (
    <MessagesContext.Provider value={value}>
      {children}
    </MessagesContext.Provider>
  );
};

export const useMessages = () => {
  const context = useContext(MessagesContext);
  if (!context) {
    throw new Error("useMessages must be used within a MessagesProvider");
  }
  return context;
};