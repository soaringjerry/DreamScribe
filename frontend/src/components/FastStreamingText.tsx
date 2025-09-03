import { useFastTypewriter } from '../hooks/useFastTypewriter';

interface FastStreamingTextProps {
  text: string;
  className?: string;
  speed?: number;
}

export function FastStreamingText({ text, className = '', speed = 30 }: FastStreamingTextProps) {
  const { displayedText, isTyping } = useFastTypewriter(text, speed);
  
  return (
    <span className={className}>
      {displayedText}
      {isTyping && <span className="cursor">|</span>}
    </span>
  );
}
