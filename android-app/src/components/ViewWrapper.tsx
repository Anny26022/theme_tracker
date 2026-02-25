import React, { useEffect, useRef } from 'react';
import { Animated, ViewStyle, StyleProp } from 'react-native';

interface ViewWrapperProps {
    children: React.ReactNode;
    style?: StyleProp<ViewStyle>;
}

export const ViewWrapper = ({ children, style }: ViewWrapperProps) => {
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(-10)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 400,
                useNativeDriver: true,
            }),
            Animated.timing(slideAnim, {
                toValue: 0,
                duration: 400,
                useNativeDriver: true,
            })
        ]).start();
    }, [fadeAnim, slideAnim]);

    return (
        <Animated.View style={[{ opacity: fadeAnim, transform: [{ translateX: slideAnim }] }, style]}>
            {children}
        </Animated.View>
    );
};
