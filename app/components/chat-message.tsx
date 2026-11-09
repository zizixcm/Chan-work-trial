import Markdown from 'react-markdown';
import styles from './processing-conversation.module.css';

/** Recover the inline bold-labelled bullets used in older saved replies. */
export function normalizeChatMarkdown(text:string) {
  return text.replace(/([^\n]) [*] (?=\*\*[^*\n]+\*\*)/g,'$1\n\n- ');
}

export default function ChatMessage({text}:{text:string}) {
  return <div className={styles.markdown}><Markdown skipHtml
    disallowedElements={['img']}
    components={{a:({children,href})=><a href={href} rel="noreferrer noopener" target="_blank">{children}</a>}}
  >{normalizeChatMarkdown(text)}</Markdown></div>;
}
