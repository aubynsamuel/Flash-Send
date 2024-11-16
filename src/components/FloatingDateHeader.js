import React from 'react';
import { View, Text, Animated } from 'react-native';
import { formatDate } from '../../commons';

const FloatingDateHeader = ({ visible, timestamp, theme }) => {
  if (!visible || !timestamp) return null;
  
  return (
    <View style={{
      position: 'absolute',
      top: 60,
      alignSelf: 'center',
      backgroundColor: theme === 'dark' ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.8)',
      paddingHorizontal: 10,
      paddingVertical: 3,
      borderRadius: 20,
      zIndex: 4,
      elevation: 5,
    }}>
      <Text style={{
        color: theme === 'dark' ? '#ffffff' : '#000000',
        fontSize: 14,
        fontWeight: '500',
      }}>
        {formatDate(timestamp)}
      </Text>
    </View>
  );
};

export default FloatingDateHeader;