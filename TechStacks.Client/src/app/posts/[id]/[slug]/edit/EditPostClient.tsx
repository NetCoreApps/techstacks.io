'use client';

import { useRouter } from 'next/navigation';
import { PostForm } from '@/components/forms/PostForm';
import routes from '@/lib/utils/routes';

export default function EditPostClient({ id, slug }: { id: string; slug: string }) {
  const router = useRouter();
  const postId = parseInt(id);

  const handleDone = () => {
    router.push(routes.post(postId, slug));
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <PostForm postId={postId} onDone={handleDone} />
      </div>
    </div>
  );
}

