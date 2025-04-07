import { doc, setDoc, serverTimestamp, Timestamp, FieldValue } from "firebase/firestore"; 
import { db } from "../firebase-config"; // Import initialized db

// Define the structure of the user profile document
export interface UserProfile {
    uid: string; // Matches auth uid
    name: string;
    birthday: Date | null;
    gender?: 'boy' | 'girl';
    avatarSeed?: string; // Store the seed used to generate the avatar
    // avatarOptions?: object; // Or store the full options object if preferred
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

// TODO: Add function to get user profile
// export async function getUserProfile(userId: string): Promise<UserProfile | null> { ... } 