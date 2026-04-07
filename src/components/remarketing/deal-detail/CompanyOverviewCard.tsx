/**
 * CompanyOverviewCard.tsx
 *
 * Editable card displaying a deal's company profile including name, website,
 * structured address, founded year, employee counts, industry, Google reviews,
 * LinkedIn data, and deal quality score with inline editing support.
 *
 * Data sources:
 *   Props passed from parent (listings table fields); onSave callback persists
 *   edits back to the listings table
 *
 * Used on:
 *   ReMarketing deal detail page (/admin/remarketing/deals/:id),
 *   Pipeline deal info tab (/admin/deals/pipeline/:id)
 */
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { NumericInput } from "@/components/ui/numeric-input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Pencil,
  Loader2,
  Building2,
  ExternalLink,
  Globe,
  MapPin,
  Home,
  Calendar,
  Users,
  Building,
  MapPinned,
  Star,
  Linkedin,
  Target,
  Briefcase,
} from "lucide-react";
import { toast } from "sonner";

// US state codes for dropdown
const US_STATES = [
  { code: 'AL', name: 'Alabama' }, { code: 'AK', name: 'Alaska' }, { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' }, { code: 'CA', name: 'California' }, { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' }, { code: 'DE', name: 'Delaware' }, { code: 'DC', name: 'Washington DC' },
  { code: 'FL', name: 'Florida' }, { code: 'GA', name: 'Georgia' }, { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' }, { code: 'IL', name: 'Illinois' }, { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' }, { code: 'KS', name: 'Kansas' }, { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' }, { code: 'ME', name: 'Maine' }, { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' }, { code: 'MI', name: 'Michigan' }, { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' }, { code: 'MO', name: 'Missouri' }, { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' }, { code: 'NV', name: 'Nevada' }, { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' }, { code: 'NM', name: 'New Mexico' }, { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' }, { code: 'ND', name: 'North Dakota' }, { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' }, { code: 'OR', name: 'Oregon' }, { code: 'PA', name: 'Pennsylvania' },
  { code: 'PR', name: 'Puerto Rico' }, { code: 'RI', name: 'Rhode Island' }, { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' }, { code: 'TN', name: 'Tennessee' }, { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' }, { code: 'VT', name: 'Vermont' }, { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' }, { code: 'WV', name: 'West Virginia' }, { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' },
];

// Canadian province codes
const CA_PROVINCES = [
  { code: 'AB', name: 'Alberta' }, { code: 'BC', name: 'British Columbia' }, { code: 'MB', name: 'Manitoba' },
  { code: 'NB', name: 'New Brunswick' }, { code: 'NL', name: 'Newfoundland' }, { code: 'NS', name: 'Nova Scotia' },
  { code: 'NT', name: 'Northwest Territories' }, { code: 'NU', name: 'Nunavut' }, { code: 'ON', name: 'Ontario' },
  { code: 'PE', name: 'Prince Edward Island' }, { code: 'QC', name: 'Quebec' }, { code: 'SK', name: 'Saskatchewan' },
  { code: 'YT', name: 'Yukon' },
];

interface CompanyOverviewCardProps {
  companyName?: string | null;
  website: string | null;
  location: string | null; // Legacy marketplace location
  address: string | null; // Legacy full address
  foundedYear: number | null;
  employees: {
    fullTime: number | null;
    partTime: number | null;
  };
  industry: string | null;
  numberOfLocations: number | null;
  locationRadiusRequirement: string | null;
  category: string | null;
  status: string;
  // New structured address fields
  streetAddress?: string | null;
  addressCity?: string | null;
  addressState?: string | null;
  addressZip?: string | null;
  addressCountry?: string | null;
  // Google reviews data
  googleReviewCount?: number | null;
  googleRating?: number | null;
  googleMapsUrl?: string | null;
  // LinkedIn data
  linkedinUrl?: string | null;
  linkedinEmployeeCount?: number | null;
  linkedinEmployeeRange?: string | null;
  // Deal quality score
  dealQualityScore?: number | null;
  /** The AI-calculated score (read-only, for reference) */
  aiCalculatedScore?: number | null;
  onScoreChange?: (newScore: number) => Promise<void>;
  // Hired a broker flag
  hiredBroker?: boolean;
  onHiredBrokerChange?: (value: boolean) => Promise<void>;
  onSave: (data: {
    companyName: string;
    website: string;
    address: string;
    foundedYear: number | null;
    industry: string;
    numberOfLocations: number | null;
    locationRadiusRequirement: string;
    // Structured address
    streetAddress: string;
    addressCity: string;
    addressState: string;
    addressZip: string;
    addressCountry: string;
    // LinkedIn
    linkedinUrl: string;
    linkedinEmployeeCount: number | null;
    linkedinEmployeeRange: string;
    // Employees
    fullTimeEmployees: number | null;
    partTimeEmployees: number | null;
    // Google
    googleRating: number | null;
    googleReviewCount: number | null;
    googleMapsUrl: string;
    hiredBroker: boolean;
  }) => Promise<void>;
}

export const CompanyOverviewCard = ({
  companyName,
  website,
  location,
  address,
  foundedYear,
  employees,
  industry,
  numberOfLocations,
  locationRadiusRequirement,
  category,
  status,
  streetAddress,
  addressCity,
  addressState,
  addressZip,
  addressCountry,
  googleReviewCount,
  googleRating,
  googleMapsUrl,
  linkedinUrl,
  linkedinEmployeeCount,
  linkedinEmployeeRange,
  dealQualityScore,
  aiCalculatedScore,
  onScoreChange,
  hiredBroker,
  onHiredBrokerChange,
  onSave,
}: CompanyOverviewCardProps) => {
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [scorePopoverOpen, setScorePopoverOpen] = useState(false);
  const [editingScore, setEditingScore] = useState("");
  const [isSavingScore, setIsSavingScore] = useState(false);
  const [formData, setFormData] = useState({
    companyName: companyName || "",
    website: website || "",
    address: address || "",
    foundedYear: foundedYear?.toString() || "",
    industry: industry || "",
    numberOfLocations: numberOfLocations?.toString() || "",
    locationRadiusRequirement: locationRadiusRequirement || "",
    // Structured address
    streetAddress: streetAddress || "",
    addressCity: addressCity || "",
    addressState: addressState || "",
    addressZip: addressZip || "",
    addressCountry: addressCountry || "US",
    // LinkedIn
    linkedinUrl: linkedinUrl || "",
    linkedinEmployeeCount: linkedinEmployeeCount?.toString() || "",
    linkedinEmployeeRange: linkedinEmployeeRange || "",
    // Employees
    fullTimeEmployees: employees.fullTime?.toString() || "",
    partTimeEmployees: employees.partTime?.toString() || "",
    // Google
    googleRating: googleRating?.toString() || "",
    googleReviewCount: googleReviewCount?.toString() || "",
    googleMapsUrl: googleMapsUrl || "",
    hiredBroker: !!hiredBroker,
  });
  const [isSaving, setIsSaving] = useState(false);

  const handleScoreSave = async () => {
    if (!onScoreChange) return;
    const num = parseInt(editingScore);
    if (isNaN(num) || num < 0 || num > 100) {
      toast.error("Score must be between 0 and 100");
      return;
    }
    setIsSavingScore(true);
    try {
      await onScoreChange(num);
      setScorePopoverOpen(false);
      toast.success("Quality score updated");
    } catch {
      toast.error("Failed to update score");
    } finally {
      setIsSavingScore(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave({
        companyName: formData.companyName,
        website: formData.website,
        address: formData.address,
        foundedYear: formData.foundedYear ? parseInt(formData.foundedYear) : null,
        industry: formData.industry,
        numberOfLocations: formData.numberOfLocations ? parseInt(formData.numberOfLocations) : null,
        locationRadiusRequirement: formData.locationRadiusRequirement,
        streetAddress: formData.streetAddress,
        addressCity: formData.addressCity,
        addressState: formData.addressState,
        addressZip: formData.addressZip,
        addressCountry: formData.addressCountry,
        linkedinUrl: formData.linkedinUrl,
        linkedinEmployeeCount: formData.linkedinEmployeeCount ? parseInt(formData.linkedinEmployeeCount) : null,
        linkedinEmployeeRange: formData.linkedinEmployeeRange,
        fullTimeEmployees: formData.fullTimeEmployees ? parseInt(formData.fullTimeEmployees) : null,
        partTimeEmployees: formData.partTimeEmployees ? parseInt(formData.partTimeEmployees) : null,
        googleRating: formData.googleRating ? parseFloat(formData.googleRating) : null,
        googleReviewCount: formData.googleReviewCount ? parseInt(formData.googleReviewCount) : null,
        googleMapsUrl: formData.googleMapsUrl,
        hiredBroker: formData.hiredBroker,
      });
      setIsEditOpen(false);
      toast.success("Company overview updated");
    } catch (error) {
      toast.error("Failed to save");
    } finally {
      setIsSaving(false);
    }
  };

  const openEdit = () => {
    setFormData({
      companyName: companyName || "",
      website: website || "",
      address: address || "",
      foundedYear: foundedYear?.toString() || "",
      industry: industry || "",
      numberOfLocations: numberOfLocations?.toString() || "",
      locationRadiusRequirement: locationRadiusRequirement || "",
      streetAddress: streetAddress || "",
      addressCity: addressCity || "",
      addressState: addressState || "",
      addressZip: addressZip || "",
      addressCountry: addressCountry || "US",
      linkedinUrl: linkedinUrl || "",
      linkedinEmployeeCount: linkedinEmployeeCount?.toString() || "",
      linkedinEmployeeRange: linkedinEmployeeRange || "",
      fullTimeEmployees: employees.fullTime?.toString() || "",
      partTimeEmployees: employees.partTime?.toString() || "",
      googleRating: googleRating?.toString() || "",
      googleReviewCount: googleReviewCount?.toString() || "",
      googleMapsUrl: googleMapsUrl || "",
      hiredBroker: !!hiredBroker,
    });
    setIsEditOpen(true);
  };

  const formatWebsiteDisplay = (url: string | null) => {
    if (!url) return "Not specified";
    return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  };

  const getWebsiteHref = (url: string | null) => {
    if (!url) return "#";
    if (url.startsWith("http")) return url;
    return `https://${url}`;
  };

  // Format headquarters display - prefer structured address over legacy location
  const getHeadquartersDisplay = () => {
    if (addressCity && addressState) {
      return `${addressCity}, ${addressState}`;
    }
    return location || "–";
  };

  // Format full address display - include zip and country
  const getFullAddressDisplay = () => {
    const parts: string[] = [];
    
    // Line 1: Street address
    if (streetAddress) parts.push(streetAddress);
    
    // Line 2: City, State ZIP
    const cityStateZip: string[] = [];
    if (addressCity) cityStateZip.push(addressCity);
    if (addressState) {
      if (cityStateZip.length > 0) {
        // Append state to city with comma
        cityStateZip[cityStateZip.length - 1] += `, ${addressState}`;
      } else {
        cityStateZip.push(addressState);
      }
    }
    if (addressZip) {
      if (cityStateZip.length > 0) {
        cityStateZip[cityStateZip.length - 1] += ` ${addressZip}`;
      } else {
        cityStateZip.push(addressZip);
      }
    }
    if (cityStateZip.length > 0) parts.push(cityStateZip.join(''));
    
    // Line 3: Country (if not US, or always show for completeness)
    if (addressCountry) {
      const countryDisplay = addressCountry === 'US' ? 'United States' : addressCountry === 'CA' ? 'Canada' : addressCountry;
      parts.push(countryDisplay);
    }
    
    if (parts.length > 0) return parts;
    if (address) return [address];
    return null;
  };

  const fullAddress = getFullAddressDisplay();

  const InfoRow = ({ 
    icon: Icon, 
    label, 
    value, 
  }: { 
    icon: React.ElementType; 
    label: string; 
    value: React.ReactNode; 
  }) => (
    <div className="flex items-start gap-2 py-2">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide block">
          {label}
        </span>
        <span className="font-medium text-sm mt-0.5 block truncate">
          {value}
        </span>
      </div>
    </div>
  );

  const allStates = [...US_STATES, ...CA_PROVINCES];

  return (
    <>
      <Card>
        <CardHeader className="py-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Company Overview
            </CardTitle>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={openEdit}>
              <Pencil className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1 divide-y lg:divide-y-0 lg:divide-x divide-border">
            {/* Column 1 */}
            <div className="space-y-1 lg:pr-6">
              {/* Company Name */}
              <InfoRow
                icon={Building2}
                label="COMPANY NAME"
                value={companyName || "–"}
              />

              {/* Website */}
              <div className="flex items-start gap-2 py-2">
                <Globe className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide block">
                    WEBSITE
                  </span>
                  {website ? (
                    <a
                      href={getWebsiteHref(website)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-sm flex items-center gap-1 text-primary hover:underline mt-0.5"
                    >
                      {formatWebsiteDisplay(website)}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <span className="text-sm text-muted-foreground mt-0.5 block">–</span>
                  )}
                </div>
              </div>

              <InfoRow 
                icon={MapPin} 
                label="HEADQUARTERS" 
                value={getHeadquartersDisplay()} 
              />

              <InfoRow 
                icon={Home} 
                label="ADDRESS" 
                value={
                  fullAddress ? (
                    <div className="max-w-[180px]">
                      {fullAddress.map((line) => (
                        <div key={line}>{line}</div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">–</span>
                  )
                } 
              />

              <InfoRow 
                icon={Calendar} 
                label="FOUNDED" 
                value={foundedYear || "–"} 
              />

              <InfoRow 
                icon={Users} 
                label="EMPLOYEES" 
                value={
                  employees.fullTime || employees.partTime
                    ? `${employees.fullTime ? `${employees.fullTime} FT` : ""}${employees.fullTime && employees.partTime ? " + " : ""}${employees.partTime ? `${employees.partTime} PT` : ""}`
                    : "–"
                } 
              />
            </div>

            {/* Column 2 */}
            <div className="space-y-1 lg:px-6 pt-3 lg:pt-0">
              <InfoRow
                icon={Linkedin}
                label="LINKEDIN"
                value={
                  linkedinUrl ? (
                    <a
                      href={linkedinUrl.startsWith("http") ? linkedinUrl : `https://${linkedinUrl}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline flex items-center gap-1"
                    >
                      {linkedinUrl.replace(/^https?:\/\/(www\.)?linkedin\.com\/company\//i, "").replace(/\/$/, "")}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    "–"
                  )
                }
              />

              <InfoRow
                icon={Users}
                label="LINKEDIN EMPLOYEES"
                value={linkedinEmployeeCount ? linkedinEmployeeCount.toLocaleString() : "–"}
              />

              <InfoRow
                icon={Users}
                label="EMPLOYEE RANGE"
                value={linkedinEmployeeRange || "–"}
              />

              <InfoRow
                icon={Building}
                label="INDUSTRY"
                value={industry || category || "–"}
              />

              <InfoRow
                icon={Building2}
                label="LOCATIONS" 
                value={
                  numberOfLocations 
                    ? `${numberOfLocations}${locationRadiusRequirement ? ` (${locationRadiusRequirement})` : ""}`
                    : "–"
                } 
              />
            </div>

            {/* Column 3 */}
            <div className="space-y-1 lg:pl-6 pt-3 lg:pt-0">
              <InfoRow
                icon={Star}
                label="GOOGLE RATING"
                value={
                  googleRating ? (
                    <span className="flex items-center gap-1">
                      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                      <span className="font-semibold">{googleRating.toFixed(1)}</span>
                      {googleMapsUrl && (
                        <a
                          href={googleMapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline ml-1"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </span>
                  ) : (
                    "–"
                  )
                }
              />

              <InfoRow
                icon={Star}
                label="GOOGLE REVIEWS"
                value={
                  googleReviewCount !== null && googleReviewCount !== undefined
                    ? `${googleReviewCount.toLocaleString()} review${googleReviewCount !== 1 ? 's' : ''}`
                    : "–"
                }
              />

              {/* Deal Quality Score - Clickable */}
              <div className="flex items-start gap-2 py-2">
                <Target className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide block">
                    QUALITY SCORE
                  </span>
                  <Popover 
                    open={scorePopoverOpen} 
                    onOpenChange={(open) => {
                      setScorePopoverOpen(open);
                      if (open) {
                        setEditingScore(dealQualityScore?.toString() || "");
                      }
                    }}
                  >
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="flex items-center gap-2 mt-0.5 hover:bg-muted/50 rounded px-1 -mx-1 transition-colors cursor-pointer"
                        title="Click to edit score"
                      >
                        {dealQualityScore !== null && dealQualityScore !== undefined ? (
                          <>
                            <span className={`text-lg font-bold ${
                              dealQualityScore >= 80 ? 'text-green-600' :
                              dealQualityScore >= 60 ? 'text-amber-600' :
                              dealQualityScore >= 40 ? 'text-orange-500' :
                              'text-red-500'
                            }`}>
                              {dealQualityScore}
                            </span>
                            <span className="text-xs text-muted-foreground">/100</span>
                            <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100" />
                          </>
                        ) : (
                          <span className="text-sm text-muted-foreground">Click to set score</span>
                        )}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72 p-5" align="start">
                      <div className="space-y-4">
                        {/* Always show the AI-calculated score */}
                        {aiCalculatedScore !== null && aiCalculatedScore !== undefined && (
                          <div className="flex items-center justify-between text-sm border-b pb-3">
                            <span className="text-muted-foreground font-medium">AI Calculated</span>
                            <span className={`text-base font-bold ${
                              aiCalculatedScore >= 80 ? 'text-green-600' :
                              aiCalculatedScore >= 60 ? 'text-amber-600' :
                              aiCalculatedScore >= 40 ? 'text-orange-500' :
                              'text-red-500'
                            }`}>
                              {aiCalculatedScore}/100
                            </span>
                          </div>
                        )}
                        <div>
                          <Label htmlFor="quality-score" className="text-sm font-medium">Override Score (0-100)</Label>
                          <Input
                            id="quality-score"
                            type="number"
                            min={0}
                            max={100}
                            value={editingScore}
                            onChange={(e) => setEditingScore(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleScoreSave();
                              }
                            }}
                            className="mt-2 h-11 text-base"
                            placeholder="0-100"
                          />
                        </div>
                        <div className="flex gap-3 pt-1">
                          <Button
                            variant="outline"
                            className="flex-1 h-10"
                            onClick={() => setScorePopoverOpen(false)}
                          >
                            Cancel
                          </Button>
                          <Button
                            className="flex-1 h-10"
                            onClick={handleScoreSave}
                            disabled={isSavingScore}
                          >
                            {isSavingScore ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                          </Button>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              {/* Status */}
              <div className="flex items-start gap-2 py-2">
                <MapPinned className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide block">
                    STATUS
                  </span>
                  <Badge variant={status === "active" ? "default" : "secondary"} className="capitalize mt-0.5">
                    {status}
                  </Badge>
                </div>
              </div>

              {/* Hired a Broker */}
              <div className="flex items-start gap-2 py-2">
                <Briefcase className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide block">
                    HIRED A BROKER
                  </span>
                  <div className="flex items-center gap-2 mt-1">
                    <Checkbox
                      id="hired-broker"
                      checked={!!hiredBroker}
                      onCheckedChange={async (checked) => {
                        if (onHiredBrokerChange) {
                          try {
                            await onHiredBrokerChange(!!checked);
                            toast.success(checked ? "Marked as hired a broker" : "Broker flag removed");
                          } catch {
                            toast.error("Failed to update broker status");
                          }
                        }
                      }}
                    />
                    <label
                      htmlFor="hired-broker"
                      className="text-sm font-medium cursor-pointer select-none"
                    >
                      {hiredBroker ? "Yes" : "No"}
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Company Overview</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="companyName">Company Name</Label>
              <Input
                id="companyName"
                placeholder="Company name"
                value={formData.companyName}
                onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                className="mt-1.5"
              />
            </div>

            <div>
              <Label htmlFor="website">Website</Label>
              <Input
                id="website"
                placeholder="www.company.com"
                value={formData.website}
                onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                className="mt-1.5"
              />
            </div>

            {/* Structured Address Section */}
            <div className="space-y-3 p-3 bg-muted/50 rounded-lg">
              <Label className="text-sm font-medium">Headquarters Address</Label>
              
              <div>
                <Label htmlFor="streetAddress" className="text-xs text-muted-foreground">Street Address</Label>
                <Input
                  id="streetAddress"
                  placeholder="123 Main Street, Suite 100"
                  value={formData.streetAddress}
                  onChange={(e) => setFormData({ ...formData, streetAddress: e.target.value })}
                  className="mt-1"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="addressCity" className="text-xs text-muted-foreground">City</Label>
                  <Input
                    id="addressCity"
                    placeholder="Dallas"
                    value={formData.addressCity}
                    onChange={(e) => setFormData({ ...formData, addressCity: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="addressState" className="text-xs text-muted-foreground">State</Label>
                  <Select
                    value={formData.addressState}
                    onValueChange={(value) => setFormData({ ...formData, addressState: value })}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select state" />
                    </SelectTrigger>
                    <SelectContent>
                      {allStates.map((state) => (
                        <SelectItem key={state.code} value={state.code}>
                          {state.code} - {state.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="addressZip" className="text-xs text-muted-foreground">ZIP Code</Label>
                  <Input
                    id="addressZip"
                    placeholder="75201"
                    value={formData.addressZip}
                    onChange={(e) => setFormData({ ...formData, addressZip: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="addressCountry" className="text-xs text-muted-foreground">Country</Label>
                  <Select
                    value={formData.addressCountry}
                    onValueChange={(value) => setFormData({ ...formData, addressCountry: value })}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select country" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="US">United States</SelectItem>
                      <SelectItem value="CA">Canada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="foundedYear">Founded Year</Label>
                <Input
                  id="foundedYear"
                  type="number"
                  placeholder="2005"
                  value={formData.foundedYear}
                  onChange={(e) => setFormData({ ...formData, foundedYear: e.target.value })}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="numberOfLocations">Locations</Label>
                <NumericInput
                  id="numberOfLocations"
                  placeholder="5"
                  value={formData.numberOfLocations}
                  onChange={(value) => setFormData({ ...formData, numberOfLocations: value })}
                  className="mt-1.5"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="industry">Industry</Label>
              <Input
                id="industry"
                placeholder="e.g., Collision Repair"
                value={formData.industry}
                onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="radiusReq">Location Radius Requirement</Label>
              <Input
                id="radiusReq"
                placeholder="e.g., within 50 miles"
                value={formData.locationRadiusRequirement}
                onChange={(e) =>
                  setFormData({ ...formData, locationRadiusRequirement: e.target.value })
                }
                className="mt-1.5"
              />
            </div>

            {/* Employees */}
            <div className="space-y-3 p-3 bg-muted/50 rounded-lg">
              <Label className="text-sm font-medium">Employees</Label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="fullTimeEmployees" className="text-xs text-muted-foreground">Full-Time</Label>
                  <NumericInput
                    id="fullTimeEmployees"
                    placeholder="25"
                    value={formData.fullTimeEmployees}
                    onChange={(value) => setFormData({ ...formData, fullTimeEmployees: value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="partTimeEmployees" className="text-xs text-muted-foreground">Part-Time</Label>
                  <NumericInput
                    id="partTimeEmployees"
                    placeholder="5"
                    value={formData.partTimeEmployees}
                    onChange={(value) => setFormData({ ...formData, partTimeEmployees: value })}
                    className="mt-1"
                  />
                </div>
              </div>
            </div>

            {/* LinkedIn */}
            <div className="space-y-3 p-3 bg-muted/50 rounded-lg">
              <Label className="text-sm font-medium">LinkedIn</Label>
              <div>
                <Label htmlFor="linkedinUrl" className="text-xs text-muted-foreground">LinkedIn URL</Label>
                <Input
                  id="linkedinUrl"
                  placeholder="https://linkedin.com/company/..."
                  value={formData.linkedinUrl}
                  onChange={(e) => setFormData({ ...formData, linkedinUrl: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="linkedinEmployeeCount" className="text-xs text-muted-foreground">Employee Count</Label>
                  <NumericInput
                    id="linkedinEmployeeCount"
                    placeholder="34"
                    value={formData.linkedinEmployeeCount}
                    onChange={(value) => setFormData({ ...formData, linkedinEmployeeCount: value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="linkedinEmployeeRange" className="text-xs text-muted-foreground">Employee Range</Label>
                  <Input
                    id="linkedinEmployeeRange"
                    placeholder="11-50 employees"
                    value={formData.linkedinEmployeeRange}
                    onChange={(e) => setFormData({ ...formData, linkedinEmployeeRange: e.target.value })}
                    className="mt-1"
                  />
                </div>
              </div>
            </div>

            {/* Google */}
            <div className="space-y-3 p-3 bg-muted/50 rounded-lg">
              <Label className="text-sm font-medium">Google</Label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="googleRating" className="text-xs text-muted-foreground">Rating</Label>
                  <Input
                    id="googleRating"
                    type="number"
                    step="0.1"
                    min="0"
                    max="5"
                    placeholder="4.1"
                    value={formData.googleRating}
                    onChange={(e) => setFormData({ ...formData, googleRating: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="googleReviewCount" className="text-xs text-muted-foreground">Review Count</Label>
                  <NumericInput
                    id="googleReviewCount"
                    placeholder="17"
                    value={formData.googleReviewCount}
                    onChange={(value) => setFormData({ ...formData, googleReviewCount: value })}
                    className="mt-1"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="googleMapsUrl" className="text-xs text-muted-foreground">Google Maps URL</Label>
                <Input
                  id="googleMapsUrl"
                  placeholder="https://maps.google.com/..."
                  value={formData.googleMapsUrl}
                  onChange={(e) => setFormData({ ...formData, googleMapsUrl: e.target.value })}
                  className="mt-1"
                />
              </div>
            </div>

            {/* Hired a Broker */}
            <div className="flex items-center gap-2 pt-1">
              <Checkbox
                id="edit-hired-broker"
                checked={formData.hiredBroker}
                onCheckedChange={(checked) => setFormData({ ...formData, hiredBroker: !!checked })}
              />
              <label htmlFor="edit-hired-broker" className="text-sm font-medium cursor-pointer select-none">
                Hired a Broker
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default CompanyOverviewCard;
