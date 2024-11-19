import React, { useState } from "react";
import { Button, View, StyleSheet } from "react-native";
import Toast from "./src/components/ToastMessage";

const App = () => {
  const [toastMessage, setToastMessage] = useState("");

  const showToast = () => {
    setToastMessage("This is a toast message!");
    // Optionally reset the message after a while to trigger subsequent toasts
    setTimeout(() => setToastMessage(""), 2500);
  };

  return (
    <View style={styles.container}>
      <Button title="Show Toast" onPress={showToast} />
      <Toast message={toastMessage} duration={2000} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});

export default App;
