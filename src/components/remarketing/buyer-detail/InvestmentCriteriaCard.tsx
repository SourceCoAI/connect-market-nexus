import { Target, Pencil } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface InvestmentCriteriaCardProps {
  onEdit: () => void;
  className?: string;
}

export const InvestmentCriteriaCard = ({
  onEdit,
  className,
}: InvestmentCriteriaCardProps) => {
  return (
    <Card className={cn(className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Target className="h-4 w-4" />
            Add-on Investment Criteria
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground italic">No investment criteria available</p>
      </CardContent>
    </Card>
  );
};
