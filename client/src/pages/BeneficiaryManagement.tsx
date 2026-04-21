import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Loader2, Trash2, Plus, ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";
import { useCompanion } from "@/companion";

export default function BeneficiaryManagement() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { notifyMutation } = useCompanion();
  const [isAddingBeneficiary, setIsAddingBeneficiary] = useState(false);
  const [newBeneficiary, setNewBeneficiary] = useState({
    name: "",
    relationship: "",
    email: "",
    accessLevel: "restricted" as "full" | "restricted" | "legacy_only",
  });

  const beneficiariesQuery = trpc.beneficiary.list.useQuery();
  const createBeneficiaryMutation = trpc.beneficiary.create.useMutation();

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-ether-bg">
        <p className="text-slate-400">Please log in to manage beneficiaries</p>
      </div>
    );
  }

  const handleAddBeneficiary = async () => {
    if (!newBeneficiary.name.trim()) {
      toast.error("Please enter beneficiary name");
      return;
    }

    try {
      await createBeneficiaryMutation.mutateAsync(newBeneficiary);
      notifyMutation("beneficiary.create");
      setNewBeneficiary({
        name: "",
        relationship: "",
        email: "",
        accessLevel: "restricted",
      });
      setIsAddingBeneficiary(false);
      toast.success("Beneficiary added successfully");
      beneficiariesQuery.refetch();
    } catch (error) {
      toast.error("Failed to add beneficiary");
    }
  };

  const getAccessLevelColor = (level: string) => {
    switch (level) {
      case "full":
        return "bg-ether-magenta/15 text-ether-magenta border border-ether-magenta/30";
      case "restricted":
        return "bg-amber-500/15 text-amber-400 border border-amber-500/30";
      case "legacy_only":
        return "bg-ether-violet/15 text-ether-violet border border-ether-violet/30";
      default:
        return "bg-white/[0.06] text-slate-300 border border-white/10";
    }
  };

  const getAccessLevelDescription = (level: string) => {
    switch (level) {
      case "full":
        return "Full access to all memories and conversations";
      case "restricted":
        return "Limited access to selected memories only";
      case "legacy_only":
        return "Access only after your passing (Estate Mode)";
      default:
        return "Unknown access level";
    }
  };

  return (
    <div className="min-h-screen bg-ether-bg p-6">
      <div className="max-w-4xl mx-auto">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocation("/")}
          className="mb-4 text-slate-400 hover:text-white hover:bg-white/[0.04]"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Home
        </Button>

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Beneficiary Management</h1>
          <p className="text-slate-400">
            Manage who can access your Digital Mind and what they can see.
          </p>
        </div>

        {/* Add Beneficiary Form */}
        {!isAddingBeneficiary ? (
          <Card className="mb-8 bg-white/[0.04] border-white/[0.06]">
            <CardHeader>
              <CardTitle className="text-white">Add a Beneficiary</CardTitle>
              <CardDescription className="text-slate-400">
                Invite someone to access your Digital Mind after you're gone or during your lifetime.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={() => setIsAddingBeneficiary(true)}
                size="lg"
                data-ether-variant="primary"
                className="w-full bg-ether-violet hover:bg-ether-violet/90"
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Beneficiary
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="mb-8 bg-white/[0.04] border-white/[0.06]">
            <CardHeader>
              <CardTitle className="text-white">Add New Beneficiary</CardTitle>
            </CardHeader>
            <CardContent className="p-12">
              <div className="space-y-5">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-300">
                    Name *
                  </label>
                  <Input
                    placeholder="e.g., John Doe"
                    value={newBeneficiary.name}
                    onChange={(e) =>
                      setNewBeneficiary({ ...newBeneficiary, name: e.target.value })
                    }
                    className="bg-white/[0.04] border-white/[0.06] text-white placeholder:text-slate-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-300">
                    Relationship
                  </label>
                  <Input
                    placeholder="e.g., Son, Daughter, Friend"
                    value={newBeneficiary.relationship}
                    onChange={(e) =>
                      setNewBeneficiary({ ...newBeneficiary, relationship: e.target.value })
                    }
                    className="bg-white/[0.04] border-white/[0.06] text-white placeholder:text-slate-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-300">
                    Email
                  </label>
                  <Input
                    type="email"
                    placeholder="john@example.com"
                    value={newBeneficiary.email}
                    onChange={(e) =>
                      setNewBeneficiary({ ...newBeneficiary, email: e.target.value })
                    }
                    className="bg-white/[0.04] border-white/[0.06] text-white placeholder:text-slate-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-slate-300">
                    Access Level *
                  </label>
                  <Select
                    value={newBeneficiary.accessLevel}
                    onValueChange={(value: any) =>
                      setNewBeneficiary({ ...newBeneficiary, accessLevel: value })
                    }
                  >
                    <SelectTrigger className="bg-white/[0.04] border-white/[0.06] text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white/[0.04] border-white/[0.06] text-white">
                      <SelectItem value="full">Full Access</SelectItem>
                      <SelectItem value="restricted">Restricted Access</SelectItem>
                      <SelectItem value="legacy_only">Legacy Only (After Passing)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-slate-500 mt-2">
                    {getAccessLevelDescription(newBeneficiary.accessLevel)}
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={handleAddBeneficiary}
                    disabled={createBeneficiaryMutation.isPending}
                    data-ether-variant="primary"
                    className="flex-1 bg-ether-violet hover:bg-ether-violet/90"
                  >
                    {createBeneficiaryMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Adding...
                      </>
                    ) : (
                      "Add Beneficiary"
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setIsAddingBeneficiary(false)}
                    disabled={createBeneficiaryMutation.isPending}
                    className="border-white/[0.06] text-slate-300 hover:bg-white/[0.04]"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Beneficiaries List */}
        <Card className="bg-white/[0.04] border-white/[0.06]">
          <CardHeader>
            <CardTitle className="text-white">Your Beneficiaries</CardTitle>
            <CardDescription className="text-slate-400">
              {beneficiariesQuery.data?.length || 0} beneficiary{beneficiariesQuery.data?.length !== 1 ? "ies" : ""} configured
            </CardDescription>
          </CardHeader>
          <CardContent>
            {beneficiariesQuery.isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-ether-cyan" />
              </div>
            ) : beneficiariesQuery.data && beneficiariesQuery.data.length > 0 ? (
              <div className="space-y-4">
                {beneficiariesQuery.data.map((beneficiary: any) => (
                  <div
                    key={beneficiary.id}
                    className="border border-white/[0.06] bg-white/[0.03] rounded-lg p-4 flex items-start justify-between hover:bg-white/[0.06] transition"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold text-white">{beneficiary.name}</h3>
                        <Badge className={getAccessLevelColor(beneficiary.accessLevel)}>
                          {beneficiary.accessLevel === "full" && "Full Access"}
                          {beneficiary.accessLevel === "restricted" && "Restricted"}
                          {beneficiary.accessLevel === "legacy_only" && "Legacy Only"}
                        </Badge>
                      </div>
                      {beneficiary.relationship && (
                        <p className="text-sm text-slate-400 mb-1">
                          <strong className="text-slate-300">Relationship:</strong> {beneficiary.relationship}
                        </p>
                      )}
                      {beneficiary.email && (
                        <p className="text-sm text-slate-400">
                          <strong className="text-slate-300">Email:</strong> {beneficiary.email}
                        </p>
                      )}
                      <p className="text-xs text-slate-500 mt-2">
                        {getAccessLevelDescription(beneficiary.accessLevel)}
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" className="text-ether-magenta hover:text-ether-magenta/80 hover:bg-white/[0.04]">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-slate-400 mb-4">No beneficiaries added yet.</p>
                <p className="text-sm text-slate-500 mb-4">
                  Add beneficiaries to control who can access your Digital Mind.
                </p>
                <Button
                  onClick={() => setIsAddingBeneficiary(true)}
                  variant="outline"
                  className="border-white/[0.06] text-slate-300 hover:bg-white/[0.04]"
                >
                  Add Your First Beneficiary
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Legacy Mode Info */}
        <Card className="mt-8 bg-ether-violet/10 border-ether-violet/20">
          <CardHeader>
            <CardTitle className="text-ether-violet">About Legacy Mode</CardTitle>
          </CardHeader>
          <CardContent className="text-white">
            <p className="mb-3">
              When you set a beneficiary to "Legacy Only," they will gain access to your Digital Mind after your passing.
              This allows your wisdom, values, and reasoning to continue guiding your loved ones.
            </p>
            <p>
              You can also set "Restricted Access" beneficiaries to share specific memories and insights during your lifetime.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
