import type React from "react"

interface PixelFontProps {
  text: string
  size?: "small" | "medium" | "large" | "xlarge"
  color?: "yellow" | "white"
}

export const PixelFont: React.FC<PixelFontProps> = ({ text, size = "medium", color = "yellow" }) => {
  const sizeClasses = {
    small: "text-2xl md:text-3xl",
    medium: "text-3xl md:text-4xl",
    large: "text-5xl md:text-6xl",
    xlarge: "text-6xl md:text-8xl",
  }

  const colorClasses = {
    yellow: "text-[#ffd866]",
    white: "text-white",
  }

  return (
    <div
      className={`
        font-pixel
        ${sizeClasses[size]}
        ${colorClasses[color]}
      `}
      style={{
        textShadow: "3px 3px 0 rgba(0,0,0,0.3)",
      }}
    >
      {text}
    </div>
  )
}

