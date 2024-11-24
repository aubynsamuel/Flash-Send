import React, {useState, useRef, useEffect, useMemo, memo} from 'react';
import {
  View,
  StyleSheet,
  TextInput,
  FlatList,
  TouchableOpacity,
  StatusBar,
  Alert,
  Keyboard,
  Text,
} from 'react-native';
import {useRoute} from '@react-navigation/native';
import {db} from '../../firebaseConfig';
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
} from 'firebase/firestore';
import {useAuth} from '../AuthContext';
import TopHeaderBar from '../components/HeaderBar_ChatScreen ';
import {getRoomId} from './src/Functions/commons';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {getCurrentTime} from '../../commons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MessageObject from '../components/MessageObject';
import sendPushNotification from '../services/FCMNotificaitions';

const ChatScreen = memo(() => {
  const route = useRoute();
  const {userId, username, profileUrl} = route.params;
  const {user} = useAuth();
  const [messages, setMessages] = useState([]);
  const flatListRef = useRef(null);
  // const [isTyping, setIsTyping] = useState(false);
  const [inputText, setInputText] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState(null);
  const inputRef = useRef(null);
  const[otherUserToken, setOtherUserToken] = useState('');
  const roomId = useMemo(
    () => getRoomId(user.userId, userId),
    [userId, user.userId],
  );

  const handleReply = message => {
    setReplyTo({
      id: message.id,
      content: message.content,
      senderId: message.senderId,
      senderName: message.senderName,
    });
    inputRef.current?.focus();
  };

  const cancelReply = () => {
    setReplyTo(null);
  };

  const scrollToMessage = messageId => {
    const index = messages.findIndex(msg => msg.id === messageId);
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
      const messagesRef = collection(db, 'rooms', roomId, 'messages');
      const q = query(
        messagesRef,
        where('senderId', '!=', user?.userId),
        where('read', '==', false),
      );

      const snapshot = await getDocs(q);

      // Use a batched write for efficiency
      if (snapshot.size > 0) {
        // Only create a batch if there are documents to update
        const batch = writeBatch(db);
        snapshot.forEach(doc => {
          batch.update(doc.ref, {read: true});
        });
        await batch.commit();
      }
    } catch (error) {
      console.error('Failed to update message read status', error);
    }
  };

  useEffect(() => {
    updateMessagesReadStatus();
  }, [messages]);

  useEffect(() => {
    const fetchCachedMessages = async () => {
      try {
        const cachedMessages = await AsyncStorage.getItem(`messages_${roomId}`);
        if (cachedMessages) {
          setMessages(JSON.parse(cachedMessages));
        }
      } catch (error) {
        console.error('Failed to fetch cached messages', error);
      }
    };

    const cacheMessages = async newMessages => {
      try {
        if (!newMessages) return;
        await AsyncStorage.setItem(
          `messages_${roomId}`,
          JSON.stringify(newMessages),
        );
      } catch (error) {
        console.error('Failed to cache messages', error);
      }
    };

    const subscribeToMessages = () => {
      try {
        const docRef = doc(db, 'rooms', roomId);
        const messagesRef = collection(docRef, 'messages');
        const q = query(messagesRef, orderBy('createdAt', 'asc'));

        return onSnapshot(q, snapshot => {
          const allMessages = snapshot.docs.map(doc => ({
            ...doc.data(),
            id: doc.id,
          }));
          const sortedMessages = allMessages.sort(
            (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
          );
          // console.log('Sorted Messages:' + sortedMessages);
          if (sortedMessages !== null || sortedMessages.length > 0) {
            setMessages(sortedMessages);
            cacheMessages(sortedMessages);
          }
          updateScrollToEnd();
        });
      } catch (error) {
        console.error('failed to subscribe to firebase ' + error);
      }
    };

    const initializeChat = async () => {
      await fetchCachedMessages();
      await createRoomIfItDoesNotExist();
      const unsubscribe = subscribeToMessages();

      return () => {
        unsubscribe();
      };
    };

    const unsubscribe = initializeChat();

    const KeyboardDidShowListener = Keyboard.addListener(
      'keyboardDidShow',
      updateScrollToEnd,
    );

    return () => {
      if (unsubscribe) {
        unsubscribe;
      }
      KeyboardDidShowListener.remove();
    };
  }, [roomId]);

  const updateScrollToEnd = () => {
    setTimeout(() => {
      if (flatListRef.current) {
        flatListRef.current.scrollToEnd({animated: true});
      }
    }, 100);
  };

  const createRoomIfItDoesNotExist = async () => {
    const roomRef = doc(db, 'rooms', roomId);

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
          lastMessage: '',
          lastMessageTimestamp: getCurrentTime(),
          lastMessageSenderId: '',
        },
        {merge: true},
      );
    } else {
      console.log('Room already exists');
    }
  };

  // useEffect(() => {
  //   if (isTyping) {
  //     const timeoutId = setTimeout(() => {
  //       setIsTyping(false);
  //     }, 100);
  //     return () => {
  //       clearTimeout(timeoutId);
  //     };
  //   }
  // }, [isTyping]);

  const fetchOtherUserToken = async () => {
    try {
      const roomDocRef = doc(db, 'users', userId);
      const roomDocSnapshot = await getDoc(roomDocRef);

      if (roomDocSnapshot.exists()) {
        const roomData = roomDocSnapshot.data();
        const otherUserToken = roomData.deviceToken;
        setOtherUserToken(otherUserToken);
        console.log('Other User Token:' + otherUserToken);
      } else {
        console.error("Other User's token does not exist!");
      }
    } catch (error) {
      console.error('Error fetching other user token:', error);
    }
  };
  useEffect(() => {
    fetchOtherUserToken();
  }, []);

  const handleSend = async () => {
    const message = inputText.trim();
    setInputText(''); // Clear the input field immediately
    if (!message) return;
    
    setHighlightedMessageId(null); // Reset highlighted message if any
    cancelReply();
  
    // Optimistically update the messages state
    const newMessage = {
      id: Date.now().toString(), // Temporary ID for the UI
      type: 'text',
      content: message,
      senderId: user?.userId,
      senderName: user?.username,
      read: false,
      createdAt: new Date().toISOString(),
      replyTo, // Add reply information if exists
    };
    
    // Update the messages state for instant UI feedback
    setMessages(prevMessages => [...prevMessages, newMessage]);
  
    sendPushNotification(`New message from ${user?.username} `, message, otherUserToken);
  
    try {
      // Send message to Firebase
      const roomRef = doc(db, 'rooms', roomId);
      const messagesRef = collection(roomRef, 'messages');
      const messageRef = doc(messagesRef); // New message document reference
  
      // Update Firebase with the new message data asynchronously
      await setDoc(messageRef, {
        ...newMessage,
        createdAt: getCurrentTime(), // Override temporary ID with Firebase timestamp
      });
  
      // Update room with the last message information
      await setDoc(roomRef, {
        lastMessage: message,
        lastMessageTimestamp: getCurrentTime(),
        lastMessageSenderId: user?.userId,
      }, { merge: true });
  
      // Reset replyTo after successful send
      setReplyTo(null);
    } catch (error) {
      Alert.alert('Error', error.message);
    }
  
    updateScrollToEnd(); // Ensure scroll goes to end
  };
  

  return (
    <View style={{flex: 1}}>
      <StatusBar barStyle="dark-content" backgroundColor="lightblue" />
      <View style={{position: 'absolute', zIndex: 5, width: '100%'}}>
        <TopHeaderBar
          title={username}
          backButtonShown={true}
          profileUrl={profileUrl}
        />
      </View>
      <View style={styles.container}>
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={item => item.id}
          renderItem={({item}) => (
            <MessageObject
              item={item}
              onReply={handleReply}
              onReplyPress={scrollToMessage}
              scrollToMessage={scrollToMessage}
              isReferenceMessage={item.id === highlightedMessageId}
            />
          )}
          contentContainerStyle={styles.messages}
          showsVerticalScrollIndicator={false}
          initialNumToRender={messages.length}
          onContentSizeChange={updateScrollToEnd}
          onScrollToIndexFailed={info => {
            const wait = new Promise(resolve => setTimeout(resolve, 500));
            wait.then(() => {
              flatListRef.current?.scrollToIndex({
                index: info.index,
                animated: true,
              });
            });
          }}
        />
        {replyTo && (
          <View style={styles.replyPreview}>
            <View style={styles.replyPreviewContent}>
              <Text style={styles.replyPreviewName}>
                Replying to{' '}
                {replyTo.senderId === user?.userId
                  ? 'yourself'
                  : replyTo.senderName}
              </Text>
              <Text numberOfLines={1} style={styles.replyPreviewText}>
                {replyTo.content}
              </Text>
            </View>
            <TouchableOpacity onPress={cancelReply}>
              <Icon name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>
        )}
        <View style={styles.inputContainer}>
          <TextInput
            ref={inputRef}
            value={inputText}
            onChangeText={text => {
              // setIsTyping(true);
              setInputText(text);
            }}
            style={styles.textInputField}
            placeholder="Type a message..."
            placeholderTextColor={'grey'}
            numberOfLines={6}
            multiline={true}
          />
          <TouchableOpacity onPress={handleSend} style={styles.sendButton}>
            <Icon
              name="send"
              color={'black'}
              size={25}
              style={{
                transform: [{rotate: '-50deg'}],
              }}
            />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 1,
  },
  messages: {
    paddingHorizontal: 10,
    paddingTop: 65,
    },
  inputContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ccc',
    margin: 10,
    borderRadius: 10,
    zIndex: 2,
    backgroundColor: '#fff',
  },
  textInputField: {
    width: '90%',
    color: '#000',
    paddingHorizontal: 10,
    fontSize: 16,
    flex: 1,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'lightblue',
    justifyContent: 'center',
    alignItems: 'center',
  },
  replyPreview: {
    flexDirection: 'row',
    alignSelf: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0f0f0',
    padding: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ccc',
    top: 16,
    width: '90%',
  },
  replyPreviewContent: {
    flex: 1,
    marginRight: 8,
  },
  replyPreviewName: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#075e54',
  },
  replyPreviewText: {
    fontSize: 12,
    color: '#666',
  },
});

export default ChatScreen;