 import { useState, useEffect } from "react";
 import {
   Dialog,
   DialogContent,
   DialogHeader,
   DialogTitle,
   DialogFooter,
 } from "@/components/ui/dialog";
 import { Button } from "@/components/ui/button";
 import { Input } from "@/components/ui/input";
 import { NumericInput } from "@/components/ui/numeric-input";
 import { Label } from "@/components/ui/label";
 import { Loader2 } from "lucide-react";
 
 interface EditBuyerCompanyOverviewDialogProps {
   open: boolean;
   onOpenChange: (open: boolean) => void;
   website?: string | null;
   hqCity?: string | null;
   hqState?: string | null;
   hqCountry?: string | null;
   foundedYear?: number | null;
   employeeCount?: number | null;
   industryVertical?: string | null;
   numberOfLocations?: number | null;
   onSave: (data: {
     company_website?: string | null;
     hq_city?: string | null;
     hq_state?: string | null;
     hq_country?: string | null;
     founded_year?: number | null;
     num_employees?: number | null;
     industry_vertical?: string | null;
     number_of_locations?: number | null;
   }) => Promise<void>;
   isSaving?: boolean;
 }
 
 export const EditBuyerCompanyOverviewDialog = ({
   open,
   onOpenChange,
   website,
   hqCity,
   hqState,
   hqCountry,
   foundedYear,
   employeeCount,
   industryVertical,
   numberOfLocations,
   onSave,
   isSaving,
 }: EditBuyerCompanyOverviewDialogProps) => {
   const [formData, setFormData] = useState({
     website: website || "",
     hqCity: hqCity || "",
     hqState: hqState || "",
     hqCountry: hqCountry || "USA",
     foundedYear: foundedYear?.toString() || "",
     employeeCount: employeeCount?.toString() || "",
     industryVertical: industryVertical || "",
     numberOfLocations: numberOfLocations?.toString() || "",
   });
 
   useEffect(() => {
     if (open) {
       setFormData({
         website: website || "",
         hqCity: hqCity || "",
         hqState: hqState || "",
         hqCountry: hqCountry || "USA",
         foundedYear: foundedYear?.toString() || "",
         employeeCount: employeeCount?.toString() || "",
         industryVertical: industryVertical || "",
         numberOfLocations: numberOfLocations?.toString() || "",
       });
     }
   }, [open, website, hqCity, hqState, hqCountry, foundedYear, employeeCount, industryVertical, numberOfLocations]);
 
   const handleSave = async () => {
     await onSave({
       company_website: formData.website || null,
       hq_city: formData.hqCity || null,
       hq_state: formData.hqState || null,
       hq_country: formData.hqCountry || null,
       founded_year: formData.foundedYear ? parseInt(formData.foundedYear) : null,
       num_employees: formData.employeeCount ? parseInt(formData.employeeCount) : null,
       industry_vertical: formData.industryVertical || null,
       number_of_locations: formData.numberOfLocations ? parseInt(formData.numberOfLocations) : null,
     });
   };
 
   return (
     <Dialog open={open} onOpenChange={onOpenChange}>
       <DialogContent className="sm:max-w-lg">
         <DialogHeader>
           <DialogTitle>Edit Company Overview</DialogTitle>
         </DialogHeader>
         <div className="space-y-4 py-4">
           <div className="grid grid-cols-1 gap-4">
             <div>
               <Label htmlFor="website">Website</Label>
               <Input
                 id="website"
                 value={formData.website}
                 onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                 placeholder="https://example.com"
               />
             </div>
             <div className="grid grid-cols-3 gap-3">
               <div>
                 <Label htmlFor="hqCity">City</Label>
                 <Input
                   id="hqCity"
                   value={formData.hqCity}
                   onChange={(e) => setFormData({ ...formData, hqCity: e.target.value })}
                   placeholder="Dallas"
                 />
               </div>
               <div>
                 <Label htmlFor="hqState">State</Label>
                 <Input
                   id="hqState"
                   value={formData.hqState}
                   onChange={(e) => setFormData({ ...formData, hqState: e.target.value })}
                   placeholder="TX"
                 />
               </div>
               <div>
                 <Label htmlFor="hqCountry">Country</Label>
                 <Input
                   id="hqCountry"
                   value={formData.hqCountry}
                   onChange={(e) => setFormData({ ...formData, hqCountry: e.target.value })}
                   placeholder="USA"
                 />
               </div>
             </div>
             <div>
               <Label htmlFor="foundedYear">Founded Year</Label>
               <Input
                 id="foundedYear"
                 type="number"
                 value={formData.foundedYear}
                 onChange={(e) => setFormData({ ...formData, foundedYear: e.target.value })}
                 placeholder="2016"
               />
             </div>
             <div className="grid grid-cols-2 gap-3">
               <div>
                 <Label htmlFor="industryVertical">Industry</Label>
                 <Input
                   id="industryVertical"
                   value={formData.industryVertical}
                   onChange={(e) => setFormData({ ...formData, industryVertical: e.target.value })}
                   placeholder="Auto Body Repair"
                 />
               </div>
               <div>
                 <Label htmlFor="numberOfLocations">Number of Locations</Label>
                 <NumericInput
                   id="numberOfLocations"
                   value={formData.numberOfLocations}
                   onChange={(value) => setFormData({ ...formData, numberOfLocations: value })}
                   placeholder="6"
                 />
               </div>
             </div>
           </div>
         </div>
         <DialogFooter>
           <Button variant="outline" onClick={() => onOpenChange(false)}>
             Cancel
           </Button>
           <Button onClick={handleSave} disabled={isSaving}>
             {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
             Save
           </Button>
         </DialogFooter>
       </DialogContent>
     </Dialog>
   );
 };
 
 export default EditBuyerCompanyOverviewDialog;