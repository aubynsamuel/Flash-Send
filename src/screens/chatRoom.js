import React, {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
} from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  Keyboard,
  Text,
  Alert,
  SectionList,
} from "react-native";
import { useRoute } from "@react-navigation/native";
import { db } from "../../env/firebaseConfig";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  setDoc,
  getDoc,
  where,
  getDocs,
  writeBatch,
  deleteDoc,
  updateDoc,
} from "firebase/firestore";
import { useAuth } from "../AuthContext";
import TopHeaderBar from "../components/HeaderBar_ChatScreen";
import { getRoomId } from "../../commons";
import { getCurrentTime, formatDate } from "../../commons";
import MessageObject from "../components/MessageObject";
import { MaterialIcons } from "@expo/vector-icons";
import { sendNotification } from "../services/ExpoPushNotifications";
import getStyles from "./sreen_Styles";
import { useTheme } from "../ThemeContext";
import { StatusBar } from "expo-status-bar";
import ChatRoomBackground from "../components/ChatRoomBackground";
import storage from "../Functions/Storage";
import EmptyChatRoomList from "../components/EmptyChatRoomList";

const ChatScreen = () => {
  const route = useRoute();
  const { userId, username, profileUrl } = route.params;
  const { user } = useAuth();
  const { selectedTheme, chatBackgroundPic } = useTheme();
  const styles = getStyles(selectedTheme);
  const [messages, setMessages] = useState([]);
  const sectionListRef = useRef(null);
  const [inputText, setInputText] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState(null);
  const inputRef = useRef(null);
  const [otherUserToken, setOtherUserToken] = useState("");
  const [scrollToEnButton, setScrollToEnButton] = useState(true);
  const [renderEmptyComponent, setRenderEmptyComponent] = useState(false);
  const [editingMessage, setEditingMessage] = useState(null);
  // Uncomment to set first unread message as initial scroll position
  // const [firstUnreadIndex, setFirstUnreadIndex] = useState(null);
  const roomId = useMemo(
    () => getRoomId(user.userId, userId),
    [userId, user.userId]
  );
  // const [cacheMessagesLength, setCachedMessagesLength] = useState();

  // Initialize Chat Room
  useEffect(() => {
    const fetchCachedMessages = async () => {
      try {
        const cachedMessages = storage.getString(`messages_${roomId}`);
        const parseCacheMessages = JSON.parse(cachedMessages);
        // setCachedMessagesLength(parseCacheMessages.length);
        if (parseCacheMessages) {
          setMessages(parseCacheMessages);
          // console.log(
          //   `${cacheMessagesLength} Messages retrieved from storage successfully`
          // );
        }
      } catch (error) {
        console.error("Failed to fetch cached messages", error);
      }
    };

    const cacheMessages = async (newMessages) => {
      try {
        if (newMessages.length > 0) {
          storage.set(`messages_${roomId}`, JSON.stringify(newMessages));
          console.log("New messages cached successfully");
        }
      } catch (error) {
        console.error("Failed to cache messages", error);
      }
    };

    const subscribeToMessages = () => {
      try {
        const docRef = doc(db, "rooms", roomId);
        const messagesRef = collection(docRef, "messages");
        const q = query(messagesRef, orderBy("createdAt", "asc"));

        return onSnapshot(q, (snapshot) => {
          const allMessages = snapshot.docs.map((doc) => ({
            ...doc.data(),
            id: doc.id,
          }));
          if (allMessages !== null && allMessages.length > 0) {
            setMessages(allMessages);
            cacheMessages(allMessages);
            // console.log(
            //   `${allMessages.length} messages fetched from firebase and loaded successfully`
            // );
          }
          updateScrollToEnd();
        });
      } catch (error) {
        console.error("failed to subscribe to firebase " + error);
      }
    };

    const initializeChat = async () => {
      await fetchCachedMessages();
      await createRoomIfItDoesNotExist();
      const unsubscribe = subscribeToMessages();

      return () => {
        if (unsubscribe) unsubscribe();
      };
    };

    const cleanupListeners = initializeChat();

    // const keyboardListener = Keyboard.addListener(
    //   "keyboardDidShow",
    //   updateScrollToEnd
    // );

    return () => {
      if (cleanupListeners) cleanupListeners;
      // keyboardListener.remove();
    };
  }, []);

  // const findFirstUnreadMessageIndex = useCallback(
  //   (messages) => {
  //     return messages.findIndex(
  //       (msg) => !msg.read && msg.senderId !== user?.userId
  //     );
  //   },
  //   [user?.userId]
  // );

  // useEffect(() => {
  //   if (messages.length > 0) {
  //     const index = findFirstUnreadMessageIndex(messages);
  //     if (index !== -1) {
  //       setFirstUnreadIndex(index);
  //     }
  //   }
  // }, [messages]);

  const messagesSections = useMemo(() => {
    if (!messages.length) return [];

    // Group messages by date
    const groupedMessages = messages.reduce((acc, message) => {
      const date = formatDate(message.createdAt);
      if (!acc[date]) {
        acc[date] = [];
      }
      acc[date].push(message);
      return acc;
    }, {});

    // Convert to section formate
    return Object.entries(groupedMessages)
      .map(([date, data]) => ({
        title: date,
        data: data,
      }))
      .sort((a, b) => {
        // Sort sections by date (newest messages at the bottom)
        const dateA = a.data[0].createdAt.seconds;
        const dateB = b.data[0].createdAt.seconds;
        return dateA - dateB;
      });
  }, [messages]);

  useEffect(() => {
    if (messages.length <= 0) {
      setTimeout(() => setRenderEmptyComponent(true), 1500);
    }
    createRoomIfItDoesNotExist();
    fetchOtherUserToken();
  }, []);

  const renderSectionHeader = useCallback(
    ({ section: { title } }) => (
      <View style={styles.sectionHeader}>
        <Text
          style={[
            styles.sectionHeaderText,
            { color: selectedTheme.text.primary },
          ]}
        >
          {title}
        </Text>
      </View>
    ),
    [selectedTheme]
  );

  const updateMessagesReadStatus = async () => {
    try {
      const roomId = getRoomId(user.userId, userId);
      const messagesRef = collection(db, "rooms", roomId, "messages");
      const q = query(
        messagesRef,
        where("senderId", "!=", user?.userId),
        where("read", "==", false)
      );

      const snapshot = await getDocs(q);

      // Use a batched write for efficiency
      if (snapshot.size > 0) {
        // Only create a batch if there are documents to update
        const batch = writeBatch(db);
        snapshot.forEach((doc) => {
          batch.update(doc.ref, { read: true });
        });
        await batch.commit();
      }
    } catch (error) {
      console.error("Failed to update message read status", error);
    }
  };

  useEffect(() => {
    updateMessagesReadStatus();
  }, [messages]);

  const updateScrollToEnd = () => {
    setTimeout(() => {
      if (sectionListRef.current && messagesSections.length > 0) {
        const lastSection = messagesSections[messagesSections.length - 1];
        sectionListRef.current.scrollToLocation({
          sectionIndex: messagesSections.length - 1,
          itemIndex: lastSection.data.length - 1,
          viewPosition: 0.5,
          animated: true,
        });
      }
    }, 200);
  };

  const scrollToMessage = (messageId) => {
    setHighlightedMessageId(null)
    let sectionIndex = -1;
    let itemIndex = -1;

    // Find the section and item indices for the message
    messagesSections.forEach((section, secIndex) => {
      const msgIndex = section.data.findIndex((msg) => msg.id === messageId);
      if (msgIndex !== -1) {
        sectionIndex = secIndex;
        itemIndex = msgIndex;
      }
    });

    if (sectionIndex !== -1 && itemIndex !== -1 && sectionListRef.current) {
      // console.log(`sectionIndex, itemIndex = ${sectionIndex}, ${itemIndex}`);
      setHighlightedMessageId(messageId)
      setTimeout(()=>setHighlightedMessageId(null), 2500);
      sectionListRef.current.scrollToLocation({
        sectionIndex: sectionIndex,
        itemIndex: itemIndex,
        viewPosition: 0.5,
        animated: true,
      });
    }
  };

  const createRoomIfItDoesNotExist = useCallback(async () => {
    const roomRef = doc(db, "rooms", roomId);

    // Check if the room already exists
    const roomSnapshot = await getDoc(roomRef);

    if (!roomSnapshot.exists()) {
      // Room does not exist, create it with default values
      await setDoc(
        roomRef,
        {
          roomId,
          participants: [user.userId, userId],
          createdAt: getCurrentTime(),
          lastMessage: "",
          lastMessageTimestamp: getCurrentTime(),
          lastMessageSenderId: "",
        },
        { merge: true }
      );
    } else {
      console.log("Room already exists");
    }
  }, [roomId]);

  const fetchOtherUserToken = async () => {
    try {
      const roomDocRef = doc(db, "users", userId);
      const roomDocSnapshot = await getDoc(roomDocRef);

      if (roomDocSnapshot.exists()) {
        const roomData = roomDocSnapshot.data();
        const otherUserToken = roomData.deviceToken;
        setOtherUserToken(otherUserToken);
        console.log("Other User Token:" + otherUserToken);
      } else {
        console.error("Other User's token does not exist!");
      }
    } catch (error) {
      console.error("Error fetching other user token:", error);
    }
  };

  const retrySendMessage = async (message) => {
    try {
      const roomRef = doc(db, "rooms", roomId);
      const messagesRef = collection(roomRef, "messages");
      const messageRef = doc(messagesRef); // New message document reference
      const timeCreated = getCurrentTime();
      await setDoc(messageRef, {
        ...message,
        createdAt: timeCreated,
        delivered: true,
      });

      await setDoc(
        roomRef,
        {
          lastMessage: message.content,
          lastMessageTimestamp: timeCreated,
          lastMessageSenderId: user?.userId,
        },
        { merge: true }
      );

      sendNotification(
        otherUserToken,
        `New message from ${user?.username} `,
        message.content,
        roomId
      );

      // Update the message state to reflect successful delivery
      setMessages((prevMessages) =>
        prevMessages.map((msg) =>
          msg.id === message.id ? { ...msg, delivered: true } : msg
        )
      );
    } catch (error) {
      console.log(error);
      setMessages((prevMessages) =>
        prevMessages.map((msg) =>
          msg.id === message.id ? { ...msg, delivered: true } : msg
        )
      );
      console.error("Failed to send message", error);
    }
  };

  const handleSend = async () => {
    const message = inputText.trim();
    setInputText("");
    if (!message) return;

    if (editingMessage) {
      saveEditedMessage(message);
      return;
    }

    setReplyTo(null);

    const newMessageId = Date.now().toString();
    const timeCreated = getCurrentTime();
    const newMessage = {
      id: newMessageId,
      type: "text",
      content: message,
      senderId: user?.userId,
      senderName: user?.username,
      read: false,
      createdAt: timeCreated,
      delivered: false,
      replyTo,
    };

    // Optimistically add message to local state
    setMessages((prev) => [...prev, newMessage]);

    try {
      const roomRef = doc(db, "rooms", roomId);
      const messagesRef = collection(roomRef, "messages");
      const messageRef = doc(messagesRef);

      await setDoc(messageRef, {
        ...newMessage,
        delivered: true,
      });

      // Update room's last message
      await setDoc(
        roomRef,
        {
          lastMessage: message,
          lastMessageTimestamp: timeCreated,
          lastMessageSenderId: user?.userId,
        },
        { merge: true }
      );

      // Send notification
      if (otherUserToken) {
        sendNotification(
          otherUserToken,
          `New message from ${user?.username}`,
          message,
          roomId
        );
      }

      // Update message delivery status
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === newMessage.id ? { ...msg, delivered: true } : msg
        )
      );
    } catch (error) {
      console.error("Failed to send message:", error);
      // Mark message as failed
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === newMessage.id ? { ...msg, delivered: false } : msg
        )
      );
    }
    updateScrollToEnd();
  };

  const renderMessage = ({ item }) => (
    <MessageObject
      item={item}
      onReply={handleReply}
      onReplyPress={scrollToMessage}
      onRetry={retrySendMessage}
      scrollToMessage={scrollToMessage}
      isReferenceMessage={item.id === highlightedMessageId}
      onEdit={handleEdit}
      onDelete={handleDelete}
      theme={selectedTheme}
    />
  );

  const handleEdit = (message) => {
    setScrollToEnButton(false);
    cancelReply();
    setEditingMessage(message);
    setInputText(message.content);
    inputRef.current.focus();
  };

  const cancelEditing = () => {
    setEditingMessage(null);
    setInputText("");
    Keyboard.dismiss()
  };

  const saveEditedMessage = async () => {
    if (!editingMessage) return;

    const updatedMessage = {
      ...editingMessage,
      content: inputText,
      editedAt: getCurrentTime(),
    };

    try {
      const roomRef = doc(db, "rooms", roomId);
      const messageRef = doc(roomRef, "messages", editingMessage.id);

      await updateDoc(messageRef, updatedMessage);

      setMessages((prevMessages) =>
        prevMessages.map((msg) =>
          msg.id === editingMessage.id ? updatedMessage : msg
        )
      );

      setEditingMessage(null);
      setInputText("");
    } catch (error) {
      console.error("Failed to edit message", error);
    }
  };

  const handleDelete = async (message) => {
    Alert.alert(
      "Delete message",
      "This action cannot be undone, do you want to continue?",
      [
        {
          text: "No",
          style: "cancel",
        },
        {
          text: "Yes",
          style: "destructive",
          onPress: async () => {
            try {
              const roomRef = doc(db, "rooms", roomId);
              const messageRef = doc(roomRef, "messages", message.id);

              await deleteDoc(messageRef);

              setMessages((prevMessages) =>
                prevMessages.filter((msg) => msg.id !== message.id)
              );
            } catch (error) {
              console.error("Failed to delete message", error);
            }
          },
        },
      ]
    );
  };

  const handleReply = (message) => {
    setScrollToEnButton(false);
    cancelEditing();
    setReplyTo({
      id: message.id,
      content: message.content,
      senderId: message.senderId,
      senderName: message.senderName,
    });
    inputRef.current.focus();
  };

  const cancelReply = () => {
    setReplyTo(null);
    Keyboard.dismiss()
  };

  // Uncomment to help scroll to first unread message
  // const getItemLayout = (data, index) => ({
  //   length: 100,
  //   offset: 100 * index,
  //   index,
  // });

  return (
    <View
      style={{
        flex: 1,
        backgroundColor:
          selectedTheme === darkTheme ? selectedTheme.background : null,
      }}
    >
      {/* Background picture for chat screen */}
      <ChatRoomBackground source={chatBackgroundPic} />

      <StatusBar
        style={
          selectedTheme === purpleTheme
            ? "light"
            : selectedTheme.Statusbar.style
        }
        backgroundColor={selectedTheme.primary}
        animated={true}
      />

      <View style={{ position: "absolute", zIndex: 5, width: "100%" }}>
        <TopHeaderBar
          theme={selectedTheme}
          title={username}
          profileUrl={profileUrl}
        />
      </View>
      <View style={styles.crContainer}>
        <SectionList
          ref={sectionListRef}
          sections={messagesSections}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          renderSectionHeader={renderSectionHeader}
          contentContainerStyle={styles.crMessages}
          showsVerticalScrollIndicator={false}
          maxToRenderPerBatch={30}
          windowSize={30}
          updateCellsBatchingPeriod={50}
          initialNumToRender={20}
          stickySectionHeadersEnabled={true}
          stickyHeaderHiddenOnScroll={true}
          onContentSizeChange={updateScrollToEnd}
          onScrollBeginDrag={() => setScrollToEnButton(true)}
          onEndReached={() => setScrollToEnButton(false)}
          //Uncomment to aid initial scroll to index
          // getItemLayout={getItemLayout}
          // initialScrollIndex={
          //   firstUnreadIndex !== null ? firstUnreadIndex : messages.length - 1
          // }
          onScrollToIndexFailed={updateScrollToEnd}
          ListEmptyComponent={renderEmptyComponent && <EmptyChatRoomList />}
        />
        {scrollToEnButton && (
          <View style={styles.crScrollToEndButton}>
            <TouchableOpacity onPress={updateScrollToEnd}>
              <MaterialIcons name="double-arrow" color={"white"} size={30} />
            </TouchableOpacity>
          </View>
        )}
        {replyTo && (
          <View style={styles.crReplyPreview}>
            <View style={styles.crReplyPreviewContent}>
              <Text style={styles.crReplyPreviewName}>
                Replying to
                {replyTo.senderId === user?.userId
                  ? "yourself"
                  : replyTo.senderName}
              </Text>
              <Text numberOfLines={1} style={styles.cdReplyPreviewText}>
                {replyTo.content}
              </Text>
            </View>
            <TouchableOpacity onPress={cancelReply}>
              <MaterialIcons
                name="close"
                size={24}
                color={selectedTheme.primary}
              />
            </TouchableOpacity>
          </View>
        )}

        {editingMessage && (
          <View style={styles.crEditingPreview}>
            <View>
              <Text numberOfLines={1} style={styles.crEditingPreviewName}>
                Editing message
              </Text>
              <Text numberOfLines={1} style={styles.crEditingPreviewText}>
                {editingMessage.content}
              </Text>
            </View>
            <TouchableOpacity onPress={cancelEditing}>
              <MaterialIcons
                name="close"
                size={24}
                color={selectedTheme.primary}
              />
            </TouchableOpacity>
          </View>
        )}
        <View style={styles.crInputContainer}>
          <TextInput
            ref={inputRef}
            value={inputText}
            onChangeText={(text) => {
              setInputText(text);
            }}
            style={styles.crTextInputField}
            placeholder="Type a message..."
            placeholderTextColor={
              selectedTheme === darkTheme ? "lightgrey" : "grey"
            }
            numberOfLines={6}
            multiline={true}
          />
          <TouchableOpacity
            onPress={handleSend}
            style={styles.crSendButton}
            activeOpacity={0.1}
          >
            <MaterialIcons
              name="send"
              color={selectedTheme.text.primary}
              size={25}
              style={{
                transform: [{ rotate: "-50deg" }],
              }}
            />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

export default ChatScreen;
