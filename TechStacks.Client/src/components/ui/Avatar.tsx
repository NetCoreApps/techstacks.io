'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils/cn';

export interface AvatarProps {
  imageUrl?: string | null;
  alt?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizeClasses = {
  sm: 'w-8 h-8',
  md: 'w-10 h-10',
  lg: 'w-16 h-16',
  xl: 'w-20 h-20',
};

export function Avatar({ 
  imageUrl, 
  alt = 'User avatar', 
  size = 'md',
  className 
}: AvatarProps) {
  const [imageError, setImageError] = useState(false);

  const handleImageError = () => {
    setImageError(true);
  };

  const showFallback = !imageUrl || imageError;

  return (
    <div className={cn('relative inline-block', sizeClasses[size], className)}>
      {showFallback ? (
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

