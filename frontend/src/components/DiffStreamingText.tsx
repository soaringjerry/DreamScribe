import { useDiffTypewriter } from '../hooks/useDiffTypewriter';

interface DiffStreamingTextProps {
  text: string;
  className?: string;
}

export function DiffStreamingText({ text, className = '' }: DiffStreamingTextProps) {
  const { displayedText, cursorPosition, isAnimating, isDeleting } = useDiffTypewriter(text);
  
  // 将光标插入到正确的位置
  const beforeCursor = displayedText.substring(0, cursorPosition);
  const afterCursor = displayedText.substring(cursorPosition);
  
  return (
    <span className={className}>
      {beforeCursor}
      {isAnimating && (
        <span className={`cursor ${isDeleting ? 'deleting' : ''}`}>|</span>
      )}
      {afterCursor}
    </span>
  );
}
