import WorkspaceHeader from "../components/workspace-header";
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
      <WorkspaceHeader role="lender" />
      {children}
      <footer className="l-footer">
        Documents are private. Reviews save in PostgreSQL. External notifications are not connected.
      </footer>
    </div>
  );
}
