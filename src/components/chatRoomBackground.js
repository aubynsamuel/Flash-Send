import { View, Image, StyleSheet } from "react-native";
import React from "react";

const ChatRoomBackground = ({ source }) => {
  const defaultSource = "../../myAssets/Images/default-chat-background.webp";
  return (
    <View
      style={{
        width: "100%",
        height: "100%",
        position: "absolute",
      }}
    >
      <Image
        source={source ? { uri: source } : require(defaultSource)}
        style={{
          zIndex: -2,
          resizeMode: "cover",
          justifyContent: "center",
          alignSelf: "center",
          width: "100%",
          height: "115%",
          top: -25,
        }}
      />
      <View
        style={{
          ...StyleSheet.absoluteFillObject,
          backgroundColor: "rgba(0, 0, 0, 0.6)", // Adjust opacity to control brightness
        }}
      />
    </View>
  );
};

export default ChatRoomBackground;
