import type {ReactNode} from "react";
import type {PublicDocument} from "@/lib/model";
import DocumentPreview from "./document-preview";

export default function FilePreviewPane({document,applicationId,selector,actions}:{document:PublicDocument;applicationId:string;selector?:ReactNode;actions?:ReactNode}) {
  return <section className="file-preview-pane" aria-label="File preview"><div className="file-preview-toolbar">{selector || <strong>{document.original_name}</strong>}<div className="file-preview-actions"><a className="simple-link" href={`/api/documents/${encodeURIComponent(document.id)}?applicationId=${encodeURIComponent(applicationId)}`}>Download</a>{actions}</div></div><div className="file-preview-content"><DocumentPreview key={document.id} document={document} applicationId={applicationId}/></div></section>;
}
