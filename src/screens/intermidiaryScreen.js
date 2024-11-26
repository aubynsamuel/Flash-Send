import { View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useTheme } from "../ThemeContext";
import TopHeaderBar from "../components/HeaderBar_HomeScreen";

const IntermediaryScreen = () => {
  const { selectedTheme } = useTheme();
  const navigation = useNavigation();
  navigation.navigate("Home");
};

export default IntermediaryScreen;
