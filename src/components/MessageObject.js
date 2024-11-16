import { View, Text, TouchableOpacity, Animated } from "react-native";
import React, { memo, useRef } from "react";
import { formatTimeWithoutSeconds } from "../../commons";
import { useAuth } from "../AuthContext";
import {
  GestureHandlerRootView,
  Swipeable,
} from "react-native-gesture-handler";
import { Clipboard } from "react-native";
import {
  Menu,
  MenuOption,
  MenuOptions,
  MenuTrigger,
} from "react-native-popup-menu";
import { MaterialIcons } from "@expo/vector-icons";
import getStyles from "./Component_Styles";

const MessageObject = memo(
  ({
    item,
    onReply,
    onRetry,
    onReplyPress,
    scrollToMessage,
    isReferenceMessage = false,
    onEdit,
    onDelete,
    theme,
  }) => {
    const { user } = useAuth();
    const styles = getStyles(theme);

    const swipeableRef = useRef(null);
    const isUserMessage = item.senderId === user?.userId;
    const messageStyle = isUserMessage
      ? styles.userMessage
      : styles.otherMessage;

    const copyToClipboard = async (textToCopy) => {
      try {
        Clipboard.setString(textToCopy);
        console.log("Text copied to clipboard!");
      } catch (error) {
        console.error("Error copying text to clipboard:", error);
      }
    };

    const renderRightActions = (progress, dragX) => {
      const trans = dragX.interpolate({
        inputRange: [-50, 0],
        outputRange: [0, 50],
        extrapolate: "clamp",
      });
      return (
        <Animated.View
          style={[
            styles.replyAction,
            {
              transform: [{ translateX: trans }],
            },
          ]}
        >
          <MaterialIcons name="reply" size={24} color={theme.text.inverse} />
        </Animated.View>
      );
    };

    const renderLeftActions = (progress, dragX) => {
      const trans = dragX.interpolate({
        inputRange: [0, 50],
        outputRange: [-50, 0],
        extrapolate: "clamp",
      });
      return (
        <Animated.View
          style={[styles.replyAction, { transform: [{ translateX: trans }] }]}
        >
          <MaterialIcons name="reply" size={24} color={theme.text.inverse} />
        </Animated.View>
      );
    };

    const handleReply = () => {
      if (swipeableRef.current) {
        swipeableRef.current.close();
      }
      onReply(item);
    };

    const handleReplyReference = () => {
      if (item.replyTo) {
        scrollToMessage(item.replyTo.id);
        onReplyPress(item.replyTo.id);
      }
    };

    return (
      <GestureHandlerRootView>
        <Swipeable
          ref={swipeableRef}
          renderLeftActions={isUserMessage ? null : renderLeftActions}
          renderRightActions={isUserMessage ? renderRightActions : null}
          onSwipeableOpen={handleReply}
          leftThreshold={50}
          rightThreshold={50}
          overshootLeft={false}
          overshootRight={false}
          friction={0.5}
          enabled={!isReferenceMessage}
        >
          <View
            style={isReferenceMessage ? styles.referenceMessageContainer : null}
          >
            <View
              style={[
                isUserMessage
                  ? styles.userMessageContainer
                  : styles.otherMessageContainer,
                isReferenceMessage,
              ]}
            >
              {item.replyTo && (
                <TouchableOpacity
                  onPress={handleReplyReference}
                  activeOpacity={0.6}
                >
                  <View
                    style={[
                      styles.replyRefMessageContainer,
                      {
                        backgroundColor:
                          item.replyTo.senderId === user?.userId
                            ? "lightgrey"
                            : theme.primary,
                      },
                    ]}
                  >
                    <Text style={styles.replyToName}>
                      {item.replyTo.senderId === user?.userId
                        ? "You"
                        : item.replyTo.senderName}
                    </Text>
                    <Text numberOfLines={1} style={styles.replyToContent}>
                      {item.replyTo.content}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
              <Menu>
                <MenuTrigger>
                  <Text style={messageStyle}>{item.content}</Text>
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                    }}
                  >
                    <Text
                      style={isUserMessage ? styles.userTime : styles.otherTime}
                    >
                      {formatTimeWithoutSeconds(item.createdAt)}
                    </Text>
                    {isUserMessage && (
                      <View style={{ flexDirection: "row" }}>
                        {item.delivered && (
                          <MaterialIcons
                            name="check"
                            style={{ left: item.read ? 10 : 0 }}
                            color={item.read ? theme.readColor : "grey"}
                            size={14}
                          />
                        )}
                        {item.read && item.delivered && (
                          <MaterialIcons
                            name="check"
                            color={theme.readColor}
                            size={14}
                          />
                        )}
                      </View>
                    )}
                  </View>
                </MenuTrigger>
                <MenuOptions
                  style={styles.menuContainer}
                  customStyles={{
                    optionsContainer: {
                      // elevation: 5,
                      borderRadius: 10,
                      borderCurve: "circular",
                      marginTop: 10,
                      marginLeft: -10,
                    },
                  }}
                >
                  {/* Copy Message */}
                  <MenuOption
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                    onSelect={() => {
                      copyToClipboard(item.content);
                    }}
                  >
                    <Text style={styles.moMenuText}>Copy</Text>
                    <MaterialIcons
                      name="content-paste"
                      color={theme.text.primary}
                      size={25}
                    />
                  </MenuOption>
                  {/* Reply */}
                  <MenuOption
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                    onSelect={() => {
                      handleReply();
                    }}
                  >
                    <Text style={styles.moMenuText}>Reply</Text>
                    <MaterialIcons
                      name="reply"
                      color={theme.text.primary}
                      size={25}
                    />
                  </MenuOption>
                  {/* Edit */}
                  {isUserMessage && (
                    <MenuOption
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                      onSelect={() => {
                        onEdit(item);
                      }}
                    >
                      <Text style={styles.moMenuText}>Edit</Text>
                      <MaterialIcons
                        name="edit"
                        color={theme.text.primary}
                        size={25}
                      />
                    </MenuOption>
                  )}
                  {/* Delete */}
                  {isUserMessage && (
                    <MenuOption
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                      onSelect={() => {
                        onDelete(item);
                      }}
                    >
                      <Text style={styles.moMenuText}>Delete</Text>
                      <MaterialIcons
                        name="delete"
                        color={theme.text.primary}
                        size={25}
                      />
                    </MenuOption>
                  )}
                </MenuOptions>
              </Menu>
              {item.delivered === false && (
                <TouchableOpacity onPress={() => onRetry(item)}>
                  <MaterialIcons name="refresh" size={22} color="red" />
                </TouchableOpacity>
              )}
            </View>
          </View>
        </Swipeable>
      </GestureHandlerRootView>
    );
  }
);

export default MessageObject;
