import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Send, MessageSquarePlus } from 'lucide-react';

import { useSendDocumentQuestion } from './useMessagesActions';

// ─── DocumentDialog ───
// Modal dialog for sending questions / redlines about an NDA or Fee Agreement.

interface DocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentType: 'nda' | 'fee_agreement';
  userId: string;
}

export function DocumentDialog({ open, onOpenChange, documentType, userId }: DocumentDialogProps) {
  const [docQuestion, setDocQuestion] = useState('');
  const sendDocQuestion = useSendDocumentQuestion();
  const navigate = useNavigate();

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) setDocQuestion('');
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <MessageSquarePlus className="h-4 w-4" />
            Question about {documentType === 'nda' ? 'NDA' : 'Fee Agreement'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm" style={{ color: '#5A5A5A' }}>
            Have redlines or comments? You can describe your requested changes below, or download
            the document and send us back a redlined version. Our team will respond quickly.
          </p>
          <textarea
            value={docQuestion}
            onChange={(e) => setDocQuestion(e.target.value)}
            placeholder="Describe your redlines, questions, or requested changes..."
            className="w-full min-h-[120px] text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:ring-1 resize-none"
            style={{
              border: '1px solid #CBCBCB',
              backgroundColor: '#FCF9F0',
              color: '#0E101A',
            }}
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onOpenChange(false);
                setDocQuestion('');
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!docQuestion.trim() || sendDocQuestion.isPending}
              onClick={() => {
                sendDocQuestion.mutate(
                  {
                    documentType,
                    question: docQuestion.trim(),
                    userId,
                  },
                  {
                    onSuccess: () => {
                      onOpenChange(false);
                      setDocQuestion('');
                      navigate('/messages?deal=general');
                    },
                  },
                );
              }}
              style={{ backgroundColor: '#0E101A', color: '#FFFFFF' }}
            >
              <Send className="h-3.5 w-3.5 mr-1.5" />
              Send Question
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
