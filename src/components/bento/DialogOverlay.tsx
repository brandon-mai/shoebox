import { type FunctionComponent} from 'react';

interface Props {
  content: string;
  className?: string;
}

const DialogOverlay: FunctionComponent<Props> = ({ 
  content,
  className = '',
}) => {
  return (
    <div className={`
    rounded-2xl transition-opacity duration-200
    bg-background/90 backdrop-blur-sm shadow-md border-2 border-border
    text-foreground font-light
    xl:opacity-0
    ${className}
    `}
    >
    {content}
    </div>
  );
};

const DialogArea: FunctionComponent<Props> = ({ 
  content,
  className = '',
}) => {
  return (
    <div className={`
    rounded-2xl transition-opacity duration-200
    bg-transparent border-2 border-muted-foreground border-dashed
    text-transparent font-light
    opacity-0 xl:opacity-100
    ${className}
    `}
    >
    {content}
    </div>
  );
};

export { DialogOverlay, DialogArea};