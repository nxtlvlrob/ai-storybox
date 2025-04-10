import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/auth-context'
import { useProfile } from '../context/profile-context'
import { ProfileForm } from '../components/profile-form'
import { AvatarCreator } from '../components/avatar-creator'
import { Timestamp } from 'firebase/firestore';
import { updateUserProfile } from '../services/firestore-service';

// Define available voices (replace with actual voice IDs and descriptions)
const availableVoices = [
  { id: 'ballad', name: 'Ballad (Default)' },
  { id: 'echo', name: 'Echo' },
  { id: 'fable', name: 'Fable' },
  { id: 'onyx', name: 'Onyx' },
  { id: 'nova', name: 'Nova' },
  { id: 'shimmer', name: 'Shimmer' },
];

export function SettingsScreen() {
  const navigate = useNavigate()
  const { currentUser } = useAuth()
  const { userProfile, profileLoading, refreshProfile } = useProfile()
  const [isEditingProfile, setIsEditingProfile] = useState(false)
  const [isEditingAvatar, setIsEditingAvatar] = useState(false)
  const [isEditingVoice, setIsEditingVoice] = useState(false);
  const [selectedVoiceId, setSelectedVoiceId] = useState(userProfile?.voiceId || availableVoices[0].id);
  const [isSavingVoice, setIsSavingVoice] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editSuccessMessage, setEditSuccessMessage] = useState<string | null>(null)

  useEffect(() => {
    if (userProfile?.voiceId) {
        setSelectedVoiceId(userProfile.voiceId);
    } else {
        setSelectedVoiceId(availableVoices[0].id);
    }
  }, [userProfile?.voiceId]);

  function handleEditProfileClick() {
    setIsEditingProfile(true)
    setIsEditingAvatar(false)
    setIsEditingVoice(false);
    setEditSuccessMessage(null)
    setSaveError(null);
  }

  function handleEditAvatarClick() {
    setIsEditingAvatar(true)
    setIsEditingProfile(false)
    setIsEditingVoice(false);
    setEditSuccessMessage(null)
    setSaveError(null);
  }
  
  function handleEditVoiceClick() {
    setIsEditingVoice(true);
    setIsEditingProfile(false);
    setIsEditingAvatar(false);
    setSelectedVoiceId(userProfile?.voiceId || availableVoices[0].id);
    setEditSuccessMessage(null);
    setSaveError(null);
  }

  function handleCancelEdit() {
    setIsEditingProfile(false)
    setIsEditingAvatar(false)
    setIsEditingVoice(false);
    setSaveError(null);
  }

  function handleProfileSaveSuccess() {
    setIsEditingProfile(false)
    setEditSuccessMessage('Profile details updated successfully!')
    setTimeout(() => setEditSuccessMessage(null), 3000)
  }
  
  function handleAvatarSaveSuccess() {
    setIsEditingAvatar(false)
    setEditSuccessMessage('Avatar updated successfully!')
    setTimeout(() => setEditSuccessMessage(null), 3000)
  }
  
  async function handleVoiceSave() {
    if (!currentUser) {
      setSaveError("Not authenticated.");
      return;
    }
    setIsSavingVoice(true);
    setSaveError(null);
    try {
      await updateUserProfile(currentUser.uid, { voiceId: selectedVoiceId });
      await refreshProfile();
      setIsEditingVoice(false);
      setIsSavingVoice(false);
      setEditSuccessMessage('Voice preference updated!');
      setTimeout(() => setEditSuccessMessage(null), 3000);
    } catch (error) {
      console.error("Error saving voice preference:", error);
      setSaveError("Could not save voice preference. Please try again.");
      setIsSavingVoice(false);
    }
  }

  const isEditing = isEditingProfile || isEditingAvatar || isEditingVoice;

  function getVoiceName(voiceId?: string): string {
    return availableVoices.find(v => v.id === voiceId)?.name || 'Default';
  }

  const initialProfileData = userProfile ? {
    name: userProfile.name,
    birthday: userProfile.birthday && userProfile.birthday instanceof Timestamp 
              ? userProfile.birthday.toDate() 
              : userProfile.birthday instanceof Date 
              ? userProfile.birthday
              : null,
    gender: userProfile.gender,
  } : undefined;

  return (
    <div className="flex flex-col items-center justify-start pt-6 min-h-screen bg-blue-100 overflow-y-auto px-4 pb-10">
      <div className="w-full max-w-3xl flex items-center justify-between mb-6">
        <button 
          className="px-3 py-1.5 rounded-lg text-sm text-blue-700 bg-white bg-opacity-70 hover:bg-opacity-100 shadow-sm transition focus:outline-none focus:ring-2 focus:ring-blue-500 flex-shrink-0"
          onClick={() => isEditing ? handleCancelEdit() : navigate(-1)}
        >
          {isEditing ? 'Cancel' : 'Back'}
        </button>
        
        <h1 className="text-2xl sm:text-3xl font-bold text-blue-800 flex-grow text-center px-4">Settings</h1>

        <div className="flex-shrink-0 invisible" aria-hidden="true">
           <button className="px-3 py-1.5 rounded-lg text-sm">Back</button>
        </div>
      </div>

      {editSuccessMessage && (
        <div className="mb-4 p-3 bg-green-200 text-green-800 rounded-lg w-full max-w-md text-center shadow-sm">
          {editSuccessMessage}
        </div>
      )}

      {saveError && (
          <div className="mb-4 p-3 bg-red-200 text-red-800 rounded-lg w-full max-w-md text-center shadow-sm">
              {saveError}
          </div>
      )}

      {isEditingProfile ? (
        <div className="w-full max-w-md">
          <ProfileForm
            currentUser={currentUser}
            initialProfileData={initialProfileData}
            onSaveSuccess={handleProfileSaveSuccess}
            refreshProfile={refreshProfile}
            mode="edit"
          />
        </div>
      ) : isEditingAvatar ? (
        currentUser && (
          <div className="w-full max-w-3xl">
            <AvatarCreator
              userId={currentUser.uid}
              currentAvatarConfig={userProfile?.avatarConfig}
              onSaveSuccess={handleAvatarSaveSuccess}
              mode="edit"
            />
          </div>
        )
      ) : isEditingVoice ? (
        <div className="w-full max-w-md bg-white p-4 sm:p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold mb-4 text-blue-800 text-center">Select Story Voice</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
            {availableVoices.map((voice) => (
              <button
                key={voice.id}
                type="button"
                onClick={() => setSelectedVoiceId(voice.id)}
                className={`p-3 rounded-lg border text-center transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 ${ 
                  selectedVoiceId === voice.id
                    ? 'bg-blue-600 text-white border-blue-700 ring-blue-500 shadow'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-blue-50 hover:border-blue-300 focus:ring-blue-400'
                }`}
              >
                <span className="text-sm font-medium block">{voice.name}</span>
              </button>
            ))}
          </div>
          <div className="flex justify-center space-x-3">
            <button
              onClick={handleVoiceSave}
              disabled={isSavingVoice}
              className="px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg shadow hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
            >
              {isSavingVoice ? 'Saving...' : 'Save Voice'}
            </button>
            <button 
                className="px-5 py-2.5 bg-gray-200 text-gray-700 text-sm font-semibold rounded-lg shadow hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2"
                onClick={handleCancelEdit}
            >
                Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center w-full max-w-xl">
          <p className="mb-6 text-center px-4">Adjust Storybox settings here.</p>
          {profileLoading ? (
            <p>Loading profile...</p>
          ) : userProfile ? (
            <div className="space-y-4 flex flex-col items-center w-full">
              <div className="bg-white p-6 rounded-lg shadow-md w-full flex flex-col md:flex-row items-center md:items-start gap-6">
                 <div className="flex-shrink-0 mx-auto md:mx-0">
                   {userProfile.avatarUrl ? (
                     <img src={userProfile.avatarUrl} alt="Avatar" className="w-28 h-28 rounded-full border-2 border-gray-300" />
                   ) : (
                     <div className="w-28 h-28 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-base">
                       No Avatar
                     </div>
                   )}
                 </div>
                 
                 <div className="flex-grow flex flex-col items-center md:items-start w-full">
                   <p className="text-xl font-semibold mb-1 text-center md:text-left">{userProfile.name}</p>
                   {(userProfile.birthday instanceof Timestamp || userProfile.birthday instanceof Date) && (
                       <p className="text-sm text-gray-600 mb-1 text-center md:text-left">
                         Birthday: {userProfile.birthday instanceof Timestamp 
                                     ? userProfile.birthday.toDate().toLocaleDateString() 
                                     : userProfile.birthday.toLocaleDateString()}
                       </p>
                   )}
                   {userProfile.gender && (
                       <p className="text-sm text-gray-600 mb-4 text-center md:text-left">Gender: {userProfile.gender}</p>
                   )}
                   
                   <div className="mt-2 text-sm text-gray-600 text-center md:text-left">
                       <span className="font-medium">Story Voice:</span> {getVoiceName(userProfile.voiceId)}
                   </div>

                   <div className="mt-4 pt-4 border-t border-gray-200 w-full flex flex-col sm:flex-row items-center justify-center md:justify-start space-y-3 sm:space-y-0 sm:space-x-3">
                     <button
                       onClick={handleEditProfileClick}
                       className="w-full sm:w-auto px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg shadow hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                     >
                       Edit Profile
                     </button>
                     <button 
                        onClick={handleEditAvatarClick}
                        className="w-full sm:w-auto px-5 py-2.5 bg-green-500 text-white text-sm font-semibold rounded-lg shadow hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                     >
                       Edit Avatar
                     </button>
                     <button 
                        onClick={handleEditVoiceClick}
                        className="w-full sm:w-auto px-5 py-2.5 bg-purple-500 text-white text-sm font-semibold rounded-lg shadow hover:bg-purple-600 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
                     >
                       Edit Voice
                     </button>
                   </div>
                 </div>
              </div>
            </div>
          ) : (
            <p>Could not load profile.</p>
          )}
        </div>
      )}
    </div>
  )
} 