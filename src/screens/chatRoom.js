import React, {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
  memo,
} from "react";
import {
  View,
  TextInput,
  FlatList,
  TouchableOpacity,
  Keyboard,
  Text,
  Alert,
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
import TopHeaderBar from "../components/HeaderBar_ChatScreen ";
import { getRoomId } from "../../commons";
import { getCurrentTime } from "../../commons";
import MessageObject from "../components/MessageObject";
import { MaterialIcons } from "@expo/vector-icons";
import { sendNotification } from "../services/ExpoPushNotifications";
import getStyles from "./sreen_Styles";
import { useTheme } from "../ThemeContext";
import { StatusBar } from "expo-status-bar";
import ChatRoomBackground from "../components/chatRoomBackground";
import FloatingDateHeader from "../components/FloatingDateHeader";
import storage from "../Functions/Storage";
import EmptyChatRoomList from "../components/emptyChatRoomList";
import { useMessages } from "../MessagesLoadingContext";

const ChatScreen = () => {
  const { roomsMessages } = useMessages();
  const route = useRoute();
  const { userId, username, profileUrl } = route.params;
  const { user } = useAuth();
  const { selectedTheme, chatBackgroundPic } = useTheme();
  const styles = getStyles(selectedTheme);
  const [messages, setMessages] = useState([]);
  const flatListRef = useRef(null);
  const [inputText, setInputText] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState(null);
  const inputRef = useRef(null);
  const [otherUserToken, setOtherUserToken] = useState("");
  const [scrollToEnButton, setScrollToEnButton] = useState(true);
  const [renderEmptyComponent, setRenderEmptyComponent] = useState(false);
  const [editingMessage, setEditingMessage] = useState(null);
  const [firstUnreadIndex, setFirstUnreadIndex] = useState(null);
  const [dateHeaderVisible, setDateHeaderVisible] = useState(false);
  const [topMessageTimestamp, setTopMessageTimestamp] = useState(null);
  const dateHeaderTimeout = useRef(null);
  const roomId = useMemo(
    () => getRoomId(user.userId, userId),
    [userId, user.userId]
  );

  const findFirstUnreadMessageIndex = useCallback(
    (messages) => {
      return messages.findIndex(
        (msg) => !msg.read && msg.senderId !== user?.userId
      );
    },
    [user?.userId]
  );

  useEffect(() => {
    if (messages.length > 0) {
      const index = findFirstUnreadMessageIndex(messages);
      if (index !== -1) {
        setFirstUnreadIndex(index);
      }
    }
  }, [messages]);

  const handleViewableItemsChanged = useCallback(({ viewableItems }) => {
    if (viewableItems.length > 0) {
      const topItem = viewableItems[0];
      setTopMessageTimestamp(topItem.item.createdAt);
      setDateHeaderVisible(true);

      // Hide the date header after 2 seconds of no scrolling
      if (dateHeaderTimeout.current) {
        clearTimeout(dateHeaderTimeout.current);
      }
      dateHeaderTimeout.current = setTimeout(() => {
        setDateHeaderVisible(false);
      }, 2000);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (dateHeaderTimeout.current) {
        clearTimeout(dateHeaderTimeout.current);
      }
    };
  }, []);

  const handleEdit = (message) => {
    setScrollToEnButton(false);
    cancelReply();
    setEditingMessage(message);
    setInputText(message.content);
    inputRef.current?.focus();
  };

  const cancelEditing = () => {
    setEditingMessage(null);
    setInputText("");
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
    inputRef.current?.focus();
  };

  useEffect(() => {
    setTimeout(() => setRenderEmptyComponent(true), 1500);
  }, []);

  const cancelReply = () => {
    setReplyTo(null);
  };

  const scrollToMessage = (messageId) => {
    const index = messages.findIndex((msg) => msg.id === messageId);
    if (index !== -1 && flatListRef.current) {
      flatListRef.current.scrollToIndex({
        index,
        animated: true,
        viewPosition: 0.5,
      });
      setHighlightedMessageId(messageId);
    }
  };

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

  // Set up messages listeners
  useEffect(() => {
    if (roomsMessages[roomId]) {
      setMessages(roomsMessages[roomId]);
    }

    const keyboardListener = Keyboard.addListener(
      "keyboardDidShow",
      updateScrollToEnd
    );

    return () => {
      // unsubscribe();
      keyboardListener.remove();
      if (messages.length > 0) {
        storage.set(`messages_${roomId}`, JSON.stringify(messages));
      }
    };
  }, [roomId, roomsMessages]);

  const updateScrollToEnd = () => {
    setTimeout(() => {
      if (flatListRef.current) {
        flatListRef.current.scrollToEnd({ animated: true });
      }
    }, 100);
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
  useEffect(() => {
    createRoomIfItDoesNotExist();
    fetchOtherUserToken();
  }, []);

  const retrySendMessage = async (message) => {
    try {
      const roomRef = doc(db, "rooms", roomId);
      const messagesRef = collection(roomRef, "messages");
      const messageRef = doc(messagesRef); // New message document reference

      await setDoc(messageRef, {
        ...message,
        createdAt: getCurrentTime(),
        delivered: true,
      });

      await setDoc(
        roomRef,
        {
          lastMessage: message.content,
          lastMessageTimestamp: getCurrentTime(),
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
      saveEditedMessage();
      return;
    }

    setHighlightedMessageId(null);
    cancelReply();

    const newMessage = {
      id: Date.now().toString(),
      type: "text",
      content: message,
      senderId: user?.userId,
      senderName: user?.username,
      read: false,
      createdAt: getCurrentTime(),
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
          lastMessageTimestamp: getCurrentTime(),
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
      <View style={{ top: 10 }}>
        <FloatingDateHeader
          visible={dateHeaderVisible}
          timestamp={topMessageTimestamp}
          theme={selectedTheme === darkTheme ? "dark" : "light"}
        />
      </View>
      <View style={styles.crContainer}>
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.crMessages}
          showsVerticalScrollIndicator={false}
          maxToRenderPerBatch={15}
          updateCellsBatchingPeriod={50}
          initialNumToRender={15}
          onContentSizeChange={updateScrollToEnd}
          onViewableItemsChanged={handleViewableItemsChanged}
          viewabilityConfig={{
            itemVisiblePercentThreshold: 50,
            minimumViewTime: 100,
          }}
          getItemLayout={useCallback(
            (data, index) => ({
              length: 70,
              offset: 80 * index,
              index,
            }),
            []
          )}
          initialScrollIndex={
            firstUnreadIndex !== null ? firstUnreadIndex : messages.length - 1
          }
          onScrollBeginDrag={() => setScrollToEnButton(true)}
          onEndReached={() => setScrollToEnButton(false)}
          onScrollToIndexFailed={(info) => {
            const wait = new Promise((resolve) => setTimeout(resolve, 500));
            wait.then(() => {
              flatListRef.current?.scrollToIndex({
                index: info.index,
                animated: true,
              });
            });
          }}
          ListEmptyComponent={renderEmptyComponent && <EmptyChatRoomList />} // Ensure this is lightweight
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
                Replying to{" "}
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
            <Text style={styles.cdEditingPreviewText}>
              Editing message: {editingMessage.content}
            </Text>
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
              // setIsTyping(true);
              setInputText(text);
            }}
            style={styles.crTextInputField}
            placeholder="Type a message..."
            placeholderTextColor={
              selectedTheme === darkTheme ? "lightgrey" : "grey"
            }
            numberOfLines={2}
            multiline={true}
          />
          <TouchableOpacity onPress={handleSend} style={styles.crSendButton}>
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
