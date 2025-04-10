import { doc, setDoc, getDoc, serverTimestamp, Timestamp, FieldValue } from "firebase/firestore"; 
import { ref, uploadString, getDownloadURL, StorageReference } from "firebase/storage"; // Import storage functions
import { db, storage } from "../firebase-config"; // Import db and storage

// Define the structure of the user profile document
export interface UserProfile {
    uid: string; // Matches auth uid
    name: string;
    birthday: Date | null;
    gender?: 'boy' | 'girl';
    avatarUrl?: string; // Add field for storage URL
    avatarConfig?: { // Add this complex type
        style: 'adventurer' | 'pixel-art';
        options: Record<string, string>; // Store selected options for the style
    } | null;
    createdAt: Timestamp | FieldValue; // Use specific Firestore types
    onboardingComplete: boolean;
    // Add other fields as needed (e.g., likes, dislikes)
}

/**
 * Creates or updates a user's profile document in Firestore.
 * @param userId The Firebase Auth user ID.
 * @param profileData Partial or full user profile data.
 */
export async function updateUserProfile(userId: string, profileData: Partial<UserProfile>): Promise<void> {
    if (!userId) throw new Error("User ID is required to update profile.");

    const userDocRef = doc(db, "users", userId); // Reference to /users/{userId}

    try {
        // Use setDoc with merge: true to create or update fields without overwriting the whole doc
        await setDoc(userDocRef, {
            ...profileData,
            uid: userId, // Ensure uid is always set
            // Set createdAt only on initial creation (or update timestamp on every write if needed)
            // For simplicity, we'll let it be overwritten here, or use updateDoc for partial updates later.
            createdAt: profileData.createdAt || serverTimestamp(), 
        }, { merge: true }); 
        
        console.log(`User profile ${userId} saved successfully.`);
    } catch (error) {
        console.error("Error saving user profile:", error);
        // Re-throw or handle error as needed
        throw error;
    }
}

/**
 * Uploads an SVG string to Firebase Cloud Storage.
 * @param userId The user's ID.
 * @param svgString The SVG data as a string.
 * @param path Optional custom path prefix (defaults to 'avatars').
 * @returns The download URL of the uploaded SVG.
 */
export async function uploadAvatarSvg(userId: string, svgString: string, path: string = 'avatars'): Promise<string> {
    if (!userId) throw new Error("User ID is required to upload avatar.");
    if (!svgString) throw new Error("SVG string is required.");

    // Create a storage reference (e.g., avatars/userId/avatar.svg)
    const storageRef: StorageReference = ref(storage, `${path}/${userId}/avatar.svg`);

    try {
        // Upload the string data
        console.log(`Uploading avatar SVG for user ${userId} to ${storageRef.fullPath}...`);
        const snapshot = await uploadString(storageRef, svgString, 'raw', { 
            contentType: 'image/svg+xml' 
        });
        console.log("Upload successful:", snapshot.metadata.fullPath);

        // Get the download URL
        const downloadURL = await getDownloadURL(snapshot.ref);
        console.log("Download URL:", downloadURL);
        return downloadURL;

    } catch (error) {
        console.error("Error uploading avatar SVG:", error);
        throw error;
    }
}

/**
 * Fetches a user's profile document from Firestore.
 * @param userId The Firebase Auth user ID.
 * @returns The UserProfile data or null if not found.
 */
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
    if (!userId) {
        console.warn("Attempted to get profile for empty userId");
        return null;
    }

    const userDocRef = doc(db, "users", userId);

    try {
        const docSnap = await getDoc(userDocRef);
        if (docSnap.exists()) {
            console.log(`User profile found for ${userId}`);
            // Important: Convert Firestore Timestamp to Date object if needed by client
            const data = docSnap.data();
            if (data.createdAt && typeof data.createdAt.toDate === 'function') {
                 data.createdAt = data.createdAt.toDate();
            }
             // Ensure birthday is a Date object or null
            if (data.birthday && typeof data.birthday.toDate === 'function') {
                data.birthday = data.birthday.toDate();
            } else if (data.birthday) {
                // Handle potential string or number if data was saved incorrectly before
                data.birthday = new Date(data.birthday);
            }

            return data as UserProfile;
        } else {
            console.log(`No profile document found for user ${userId}`);
            return null;
        }
    } catch (error) {
        console.error("Error fetching user profile:", error);
        throw error; // Re-throw or handle as appropriate
    }
}

// TODO: Add function to get user profile
// export async function getUserProfile(userId: string): Promise<UserProfile | null> { ... } 