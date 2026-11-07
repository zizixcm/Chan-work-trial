import AccountMenu from "../account-menu";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getPortalSession } from "@/lib/portal-session";
import { pool } from "@/lib/db";
import type { Metadata } from "next";
import "./lender.css";
export const metadata: Metadata = { title: "Lender workspace | Proximitty" };
export default async function LenderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getPortalSession(await headers());
  if (!session) redirect("/login");
  const membership = await pool().query("SELECT 1 FROM application_memberships WHERE user_id=$1 AND active AND role='lender'", [session.user.id]);
  if (!membership.rows.length) redirect("/");
  return (
    <div className="lender">
      <header className="l-header">
        <a className="l-brand" href="/lender">
          proximitty<span>.</span>
        </a>
        <span className="l-workspace">Lender workspace</span>
        <div className="l-header-account">
        <div className="l-identity">
          <span className="l-avatar">{session.user.name.slice(0,1)}</span>
          <span>
            {session.user.name}<small>Lender</small>
          </span>
        </div>
        <AccountMenu />
        </div>
      </header>
      {children}
      <footer className="l-footer">
        Documents are private. Reviews save in PostgreSQL. External notifications are not connected.
      </footer>
    </div>
  );
}
