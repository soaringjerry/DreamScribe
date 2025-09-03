import { useSimpleTypewriter } from '../hooks/useSimpleTypewriter';

interface SimpleStreamingTextProps {
  text: string;
  className?: string;
}

export function SimpleStreamingText({ text, className = '' }: SimpleStreamingTextProps) {
  const { displayedText, isTyping } = useSimpleTypewriter(text, 30);
  
  return (
    <span className={className}>
      {displayedText}
      {isTyping && <span className="cursor">|</span>}
    </span>
  );
}
