import { View, Text } from "react-native";
import React from "react";
import LottieView from "lottie-react-native";

const EmptyChatRoomList = () => {
  return (
    <View style={{ flex: 1, marginTop: 35 }}>
      <LottieView
        source={require("../../myAssets/Lottie_Files/Animation - 1730912642416.json")}
        autoPlay
        loop={true}
        style={{
          flex: 0.8,
          width: 90 * 2,
          height: 90 * 2,
          alignSelf: "center",
          color: "red",
        }}
      />
      <Text
        style={{
          fontSize: 16,
          textAlign: "center",
        }}
      >
        No messages yet
      </Text>
      <Text
        style={{
          fontSize: 16,
          textAlign: "center",
        }}
      >
        Send a message to start a conversation
      </Text>
    </View>
  );
};

export default EmptyChatRoomList;
