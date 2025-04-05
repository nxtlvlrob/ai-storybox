"use client"

import type React from "react"
import { PixelFont } from "./pixel-font"
// import PixelEmoji from "./pixel-emoji"

interface PixelButtonProps {
  color: "orange" | "teal"
  label: string
  emoji?: string
  small?: boolean
  medium?: boolean
  large?: boolean
  onClick?: () => void
}

const PixelButton: React.FC<PixelButtonProps> = ({
  color,
  label,
  emoji,
  small = false,
  medium = false,
  large = false,
  onClick,
}) => {
  const colorClasses = {
    orange: "bg-[#e67e50] border-[#c05a30]",
    teal: "bg-[#2a8a8a] border-[#1a6a6a]",
  }

  let sizeClasses = "px-6 py-4" // default
  let fontSize = "medium"
  let emojiSize = "medium"

  if (small) {
    sizeClasses = "px-4 py-2"
    fontSize = "small"
    emojiSize = "small"
  } else if (medium) {
    sizeClasses = "px-6 py-4"
    fontSize = "medium"
    emojiSize = "medium"
  } else if (large) {
    sizeClasses = "px-8 py-6"
    fontSize = "large"
    emojiSize = "large"
  }

  return (
    <button
      className={`
        ${colorClasses[color]}
        flex items-center 
        ${sizeClasses}
        rounded-xl border-4 
        transition-transform hover:scale-105 active:scale-95
        ${emoji ? "justify-start" : "justify-center"}
        w-full
      `}
      onClick={onClick}
    >
      {emoji && (
        <div className="mr-6 flex-shrink-0">
          {/* <PixelEmoji emoji={emoji} size={emojiSize as any} /> */}
        </div>
      )}
      <div className="flex-grow text-center">
        <PixelFont text={label} size={fontSize as any} color="yellow" />
      </div>
    </button>
  )
}

export default PixelButton

