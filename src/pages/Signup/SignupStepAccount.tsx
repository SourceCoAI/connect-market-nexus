import { useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { SignupFormData } from "./types";

interface Props {
  formData: SignupFormData;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export function SignupStepAccount({ formData, onChange }: Props) {
  const [domainMatch, setDomainMatch] = useState<{ found: boolean; firm_name: string | null } | null>(null);
  const [checking, setChecking] = useState(false);

  const checkDomain = useCallback(async (email: string) => {
    if (!email || !email.includes("@")) {
      setDomainMatch(null);
      return;
    }

    setChecking(true);
    try {
      const { data, error } = await supabase.functions.invoke("check-firm-domain", {
        body: { email },
      });

      if (!error && data) {
        setDomainMatch(data as { found: boolean; firm_name: string | null });
      } else {
        setDomainMatch(null);
      }
    } catch {
      setDomainMatch(null);
    } finally {
      setChecking(false);
    }
  }, []);

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="email" className="text-xs text-muted-foreground">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="name@company.com"
          value={formData.email}
          onChange={onChange}
          onBlur={(e) => checkDomain(e.target.value)}
          required
        />
        {domainMatch?.found && domainMatch.firm_name && (
          <div className="flex items-start gap-2 p-2.5 rounded-md bg-blue-50 border border-blue-200 mt-1.5">
            <Info className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
            <p className="text-xs text-blue-700">
              Someone from <strong>{domainMatch.firm_name}</strong> is already on SourceCo.
              Your account will be linked to the existing firm record automatically.
            </p>
          </div>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password" className="text-xs text-muted-foreground">Password</Label>
        <Input id="password" name="password" type="password" placeholder="••••••••" value={formData.password} onChange={onChange} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirmPassword" className="text-xs text-muted-foreground">Confirm Password</Label>
        <Input id="confirmPassword" name="confirmPassword" type="password" placeholder="••••••••" value={formData.confirmPassword} onChange={onChange} required />
      </div>
    </div>
  );
}
