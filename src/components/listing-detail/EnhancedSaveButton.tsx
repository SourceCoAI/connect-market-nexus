import { Button } from '@/components/ui/button';
import { useSavedStatus, useSaveListingMutation } from '@/hooks/marketplace/use-saved-listings';
import { Bookmark, Share2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface EnhancedSaveButtonProps {
  listingId: string;
  listingTitle: string;
  location: string;
  onSave?: () => void;
}

export function EnhancedSaveButton({ listingId, listingTitle, location, onSave }: EnhancedSaveButtonProps) {
  const { data: isSaved } = useSavedStatus(listingId);
  const { mutate: toggleSave, isPending } = useSaveListingMutation();

  const handleQuickSave = () => {
    toggleSave(
      {
        listingId,
        action: isSaved ? 'unsave' : 'save',
      },
      {
        onSuccess: () => {
          onSave?.();
        },
      }
    );
  };

  const handleShare = () => {
    const listingUrl = `${window.location.origin}/listing/${listingId}`;
    
    const subject = `Check out this deal: ${listingTitle}`;
    
    let body = `I thought you might be interested in this deal:\n\n`;
    body += `${listingTitle}\n`;
    body += `Location: ${location}\n\n`;
    body += `View listing: ${listingUrl}\n\n`;
    body += `Note: You'll need an approved account to view the full listing details.\n`;
    
    const mailtoLink = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    
    window.location.href = mailtoLink;
  };

  return (
    <TooltipProvider>
      <div className="flex gap-1.5">
        {/* Save button - Primary action, 75% width */}
        <Button
          variant="outline"
          onClick={handleQuickSave}
          disabled={isPending}
          className="flex-[3] h-9 border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 font-medium text-[13px] tracking-[0.002em] transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-sourceco-accent/30 focus:ring-offset-2"
        >
          <Bookmark className={cn(
            "h-3.5 w-3.5 transition-colors",
            isSaved ? "fill-slate-700 text-slate-700" : "text-slate-400"
          )} />
          {isSaved ? 'Saved' : 'Save'}
        </Button>
        
        {/* Share button - Secondary action, 25% width, icon-only */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              onClick={handleShare}
              className="flex-1 h-9 px-0 border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-sourceco-accent/30 focus:ring-offset-2"
            >
              <Share2 className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Email to colleague</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
