'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { stringToColor } from '@/lib/utils/avatarColor';

export interface AvatarProps {
  imageUrl?: string | null;
  alt?: string;
  /** Username used to generate a deterministic initial + color avatar when no image is available */
  username?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizeClasses = {
  xs: 'w-6 h-6',
  sm: 'w-8 h-8',
  md: 'w-10 h-10',
  lg: 'w-16 h-16',
  xl: 'w-20 h-20',
};

// A fixed viewBox means one font size scales proportionally with the
// container at every size (~55% of the 40-unit box), so the letter stays
// equally prominent whether the avatar is xs or xl.
const InitialFontSize = 22;

export function Avatar({
  imageUrl,
  alt = 'User avatar',
  username,
  size = 'md',
  className
}: AvatarProps) {
  const [imageError, setImageError] = useState(false);

  const handleImageError = () => {
    setImageError(true);
  };

  const showFallback = !imageUrl || imageError;
  const initial = username?.trim()?.[0]?.toUpperCase();

  return (
    <div className={cn('relative inline-block', sizeClasses[size], className)}>
      {showFallback ? (
        initial ? (
          // Generated avatar: first letter of username on a color derived from a hash of the username
          <svg
            className="w-full h-full rounded-full"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 40 40"
            role="img"
            aria-label={alt}
          >
            <title>{alt}</title>
            <rect width="40" height="40" fill={stringToColor(username!)} />
            <text
              x="50%"
              y="50%"
              dy=".35em"
              textAnchor="middle"
              fill="#fff"
              fontSize={InitialFontSize}
              fontWeight="600"
              fontFamily="system-ui, sans-serif"
            >
              {initial}
            </text>
          </svg>
        ) : (
          // Anonymous user icon (SVG)
          <div className="w-full h-full rounded-full bg-gray-300 flex items-center justify-center overflow-hidden">
            <svg
              className="w-full h-full text-gray-500"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
            </svg>
          </div>
        )
      ) : (
        <img
          src={imageUrl}
          alt={alt}
          className="w-full h-full rounded-full object-cover"
          onError={handleImageError}
        />
      )}
    </div>
  );
}

