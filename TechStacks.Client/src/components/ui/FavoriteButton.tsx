'use client';

import { useAuth, PrimaryButton } from '@servicestack/react';
import { useAppStore } from '@/lib/stores/useAppStore';
import routes from '@/lib/utils/routes';

interface FavoriteButtonProps {
  type: 'technology' | 'techstack';
  id: number;
  className?: string;
}

export function FavoriteButton({ type, id, className = '' }: FavoriteButtonProps) {
  const { isAuthenticated } = useAuth();
  const {
    favoriteTechnologyIds,
    favoriteTechStackIds,
    addFavoriteTechnology,
    removeFavoriteTechnology,
    addFavoriteTechStack,
    removeFavoriteTechStack,
  } = useAppStore();

  const isFavorite =
    type === 'technology'
      ? favoriteTechnologyIds.includes(id)
      : favoriteTechStackIds.includes(id);

  const handleFavoriteToggle = async () => {
    if (!isAuthenticated) {
      window.location.href = routes.signUp();
      return;
    }

    try {
      if (type === 'technology') {
        if (isFavorite) {
          await removeFavoriteTechnology(id);
        } else {
          await addFavoriteTechnology(id);
        }
      } else {
        if (isFavorite) {
          await removeFavoriteTechStack(id);
        } else {
          await addFavoriteTechStack(id);
        }
      }
    } catch (err) {
      console.error('Failed to toggle favorite:', err);
    }
  };

  return (
    <PrimaryButton
      type="button"
      color={isFavorite ? 'green' : 'purple'}
      onClick={handleFavoriteToggle}
      className={`flex items-center ${
        isFavorite ? 'text-white' : 'text-gray-700 hover:opacity-80'
      } ${className}`}
    >
      {isFavorite ? (
        <svg
          className="size-5 mr-2"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
        >
          <path
            fill="currentColor"
            d="M17.562 21.56a1 1 0 0 1-.465-.116L12 18.764l-5.097 2.68a1 1 0 0 1-1.45-1.053l.973-5.676l-4.124-4.02a1 1 0 0 1 .554-1.705l5.699-.828l2.549-5.164a1.04 1.04 0 0 1 1.793 0l2.548 5.164l5.699.828a1 1 0 0 1 .554 1.705l-4.124 4.02l.974 5.676a1 1 0 0 1-.985 1.169Z"
          />
        </svg>
      ) : (
        <svg
          className="size-5 mr-2"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
        >
          <path
            fill="currentColor"
            d="M21.919 10.127a1 1 0 0 0-.845-1.136l-5.651-.826l-2.526-5.147a1.037 1.037 0 0 0-1.795.001L8.577 8.165l-5.651.826a1 1 0 0 0-.556 1.704l4.093 4.013l-.966 5.664a1.002 1.002 0 0 0 1.453 1.052l5.05-2.67l5.049 2.669a1 1 0 0 0 1.454-1.05l-.966-5.665l4.094-4.014a1 1 0 0 0 .288-.567m-5.269 4.05a.5.5 0 0 0-.143.441l1.01 5.921l-5.284-2.793a.5.5 0 0 0-.466 0L6.483 20.54l1.01-5.922a.5.5 0 0 0-.143-.441L3.07 9.98l5.912-.864a.5.5 0 0 0 .377-.275L12 3.46l2.64 5.382a.5.5 0 0 0 .378.275l5.913.863z"
          />
        </svg>
      )}
      {isFavorite ? 'Favorited' : 'Favorite'}
    </PrimaryButton>
  );
}

