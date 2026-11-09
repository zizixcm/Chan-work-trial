import styles from "./application-list.module.css";

export type ApplicationListItem = {id:string;name:string;secondary:string;href:string;status?:string};
export default function ApplicationList({items,error,onRetry,emptyMessage}: {items:ApplicationListItem[]|null;error:string;onRetry:()=>void;emptyMessage:string}) {
  return <main className={styles.page}>
    <h1 className={styles.heading}>Your applications</h1>
    {error && <div role="alert" className={styles.message}>{error}<button onClick={onRetry}>Try again</button></div>}
    {!items && !error && <p role="status">Loading your applications…</p>}
    {items?.length===0 && <section className={styles.empty}><h2>No active applications yet</h2><p>{emptyMessage}</p><button onClick={onRetry}>Refresh applications</button></section>}
    {!!items?.length && <ul className={styles.list}>{items.map(item=><li key={item.id}><article className={styles.row}>
      <div className={styles.identity}><h2>{item.name}</h2><p>{item.secondary}</p></div>
      {item.status && <span className={styles.status}>{item.status}</span>}
      <a className={styles.open} aria-label={`Open application: ${item.name}`} href={item.href}>Open application</a>
    </article></li>)}</ul>}
  </main>;
}
