import { db } from "../../env/firebaseConfig";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { getCurrentTime, getRoomId } from "../../commons";

export default createRoom = async (user1Id, user2Id) => {
  getRoomId(user1Id, user2Id);
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
};
