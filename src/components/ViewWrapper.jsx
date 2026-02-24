import React from 'react';
import { motion } from 'framer-motion';

/**
 * Standardized transition wrapper for all main views.
 * Ensures consistent entry/exit animations and layout spacing.
 */
export const ViewWrapper = ({ children, className = "", id = "view" }) => {
    return (
        <motion.div
            key={id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className={`space-y-12 ${className}`}
        >
            {children}
        </motion.div>
    );
};
