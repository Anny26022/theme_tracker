import { Share, Alert, Clipboard } from 'react-native';

/**
 * Mobile Clipboard Service
 * Since direct clipboard access can be restricted or requires extra permissions/packages,
 * we use the Share API as a primary way to "Copy" to the system clipboard on mobile.
 */
export const copyToClipboard = async (text: string): Promise<boolean> => {
    if (!text) return false;

    try {
        // Attempt silent copy if the deprecated core Clipboard is still available
        if (Clipboard && typeof Clipboard.setString === 'function') {
            Clipboard.setString(text);
            // We still proceed to Share if we want to guarantee it works on all OS versions,
            // or we could return true here. Let's try to be silent first.
            return true;
        }

        const result = await Share.share({
            message: text,
        });

        if (result.action === Share.sharedAction) {
            return true;
        }
        return false;
    } catch (error: any) {
        // Gracefully handle user cancellation (AbortError)
        if (error.name === 'AbortError' || error.message?.toLowerCase().includes('cancel')) {
            return false;
        }

        console.error('Clipboard Error:', error);
        Alert.alert('Copy Failed', 'Unable to access system sharing/clipboard.');
        return false;
    }
};
