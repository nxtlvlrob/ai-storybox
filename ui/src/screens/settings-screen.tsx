import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/auth-context'
import { useProfile } from '../context/profile-context'
import { ProfileForm } from '../components/profile-form'
import { AvatarCreator } from '../components/avatar-creator'
import { Timestamp } from 'firebase/firestore';

export function SettingsScreen() {
  const navigate = useNavigate()
  const { currentUser } = useAuth()
  const { userProfile, profileLoading, refreshProfile } = useProfile()
  const [isEditingProfile, setIsEditingProfile] = useState(false)
  const [isEditingAvatar, setIsEditingAvatar] = useState(false)
  const [editSuccessMessage, setEditSuccessMessage] = useState<string | null>(null)

  function handleEditProfileClick() {
    setIsEditingProfile(true)
    setIsEditingAvatar(false)
    setEditSuccessMessage(null)
  }

  function handleEditAvatarClick() {
    setIsEditingAvatar(true)
    setIsEditingProfile(false)
    setEditSuccessMessage(null)
  }

  function handleCancelEdit() {
    setIsEditingProfile(false)
    setIsEditingAvatar(false)
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

  const isEditing = isEditingProfile || isEditingAvatar;

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
    <div className="flex flex-col items-center justify-start pt-6 h-screen bg-lime-100 overflow-y-auto px-4">
      <div className="w-full max-w-3xl flex items-center justify-between mb-6">
        <button 
          className="px-4 py-2 bg-gray-300 rounded shadow hover:bg-gray-400 text-sm sm:text-base flex-shrink-0 w-28 text-center"
          onClick={() => isEditing ? handleCancelEdit() : navigate('/home')} 
        >
          {isEditing ? 'Cancel' : 'Back to Home'}
        </button>
        
        <h1 className="text-2xl sm:text-3xl font-bold text-lime-800 flex-grow text-center">Settings</h1>

        <div className="w-28 flex-shrink-0">
        </div>
      </div>

      {editSuccessMessage && (
        <div className="mb-4 p-3 bg-green-200 text-green-800 rounded-lg w-full max-w-md text-center">
          {editSuccessMessage}
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
              currentAvatarSeed={userProfile?.avatarSeed}
              onSaveSuccess={handleAvatarSaveSuccess}
              mode="edit"
            />
          </div>
        )
      ) : (
        <div className="flex flex-col items-center w-full max-w-md">
          <p className="mb-6 text-center px-4">Adjust Storybox settings here.</p>
          {profileLoading ? (
            <p>Loading profile...</p>
          ) : userProfile ? (
            <div className="space-y-4 flex flex-col items-center w-full">
              <div className="bg-white p-4 rounded-lg shadow-md w-72 text-center">
                 {userProfile.avatarUrl ? (
                    <img src={userProfile.avatarUrl} alt="Avatar" className="w-20 h-20 rounded-full mx-auto mb-3 border-2 border-gray-300" />
                 ) : (
                   <div className="w-20 h-20 rounded-full mx-auto mb-3 bg-gray-200 flex items-center justify-center text-gray-500 text-sm">
                     No Avatar
                   </div>
                 )}
                 <p className="text-lg font-semibold">{userProfile.name}</p>
                 {(userProfile.birthday instanceof Timestamp || userProfile.birthday instanceof Date) && (
                     <p className="text-sm text-gray-600">
                       Birthday: {userProfile.birthday instanceof Timestamp 
                                   ? userProfile.birthday.toDate().toLocaleDateString() 
                                   : userProfile.birthday.toLocaleDateString()}
                     </p>
                 )}
                 {userProfile.gender && (
                     <p className="text-sm text-gray-600">Gender: {userProfile.gender}</p>
                 )}
              </div>
              <button
                onClick={handleEditProfileClick}
                className="w-60 px-6 py-2 bg-blue-500 text-white font-semibold rounded-lg shadow hover:bg-blue-600"
              >
                Edit Profile Details
              </button>
               <button 
                  onClick={handleEditAvatarClick}
                  className="w-60 px-6 py-2 bg-green-500 text-white font-semibold rounded-lg shadow hover:bg-green-600"
               >
                 Edit Avatar
               </button>
            </div>
          ) : (
            <p>Could not load profile.</p>
          )}
        </div>
      )}
    </div>
  )
} 