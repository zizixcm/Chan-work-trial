import AccountMenu from "../account-menu";
import styles from "./workspace-header.module.css";

export default function WorkspaceHeader({role}: {role: "borrower" | "lender"}) {
  return <header className={styles.header}>
    <a className={styles.brand} href={role === "lender" ? "/lender" : "/"}>proximitty<span>.</span></a>
    <span className={styles.role}>{role === "lender" ? "Lender workspace" : "Borrower workspace"}</span>
    <div className={styles.account}><AccountMenu /></div>
  </header>;
}
