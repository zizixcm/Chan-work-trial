"use client";
import {useMemo,type ReactNode} from 'react';
import ProcessingConversation from './processing-conversation';
import {createConversationUiAdapter} from '@/lib/borrower-chat/bridge-browser';
export default function ConnectedProcessingConversation({applicationId,uploadSlot,onUpdated}:{applicationId:string;uploadSlot:ReactNode;onUpdated:()=>Promise<unknown>}) {
  const adapter=useMemo(()=>createConversationUiAdapter(applicationId),[applicationId]);
  return <ProcessingConversation applicationId={applicationId} adapter={adapter} uploadSlot={uploadSlot} onUpdated={onUpdated}/>;
}
