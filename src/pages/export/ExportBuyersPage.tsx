import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { supabase } from '../../lib/supabase';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../../components/ui/Table';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { 
  Users, 
  Plus, 
  Search, 
  Globe, 
  Mail, 
  Phone, 
  Eye, 
  Edit3, 
  Trash2, 
  CheckCircle2, 
  AlertCircle, 
  CreditCard, 
  RefreshCw 
} from 'lucide-react';

interface Buyer {
  id: string;
  name: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  country?: string;
  address?: string;
  payment_terms?: string;
  notes?: string;
  created_at?: string;
}

const buyerSchema = z.object({
  name: z.string().min(1, 'Company Name is required'),
  contact_person: z.string().min(1, 'Contact Person is required'),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  phone: z.string().optional(),
  country: z.string().min(1, 'Country is required'),
  address: z.string().optional(),
  payment_terms: z.string().optional(),
  notes: z.string().optional(),
});

type BuyerFormValues = z.infer<typeof buyerSchema>;

export default function ExportBuyersPage() {
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [selectedBuyer, setSelectedBuyer] = useState<Buyer | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<BuyerFormValues>({
    resolver: zodResolver(buyerSchema),
    defaultValues: {
      country: 'United States',
      payment_terms: 'Net 30 Days',
    }
  });

  const fetchBuyers = async () => {
    try {
      const { data, error } = await supabase
        .from('export_buyers')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      setBuyers(data || []);
    } catch (err: any) {
      console.error('Error fetching buyers:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchBuyers();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchBuyers();
  };

  const openAddModal = () => {
    setStatusMessage(null);
    setSelectedBuyer(null);
    reset({
      name: '',
      contact_person: '',
      email: '',
      phone: '',
      country: 'United States',
      address: '',
      payment_terms: 'Net 30 Days',
      notes: '',
    });
    setIsAddModalOpen(true);
  };

  const openEditModal = (buyer: Buyer) => {
    setStatusMessage(null);
    setSelectedBuyer(buyer);
    reset({
      name: buyer.name,
      contact_person: buyer.contact_person || '',
      email: buyer.email || '',
      phone: buyer.phone || '',
      country: buyer.country || 'United States',
      address: buyer.address || '',
      payment_terms: buyer.payment_terms || 'Net 30 Days',
      notes: buyer.notes || '',
    });
    setIsEditModalOpen(true);
  };

  const openViewModal = (buyer: Buyer) => {
    setSelectedBuyer(buyer);
    setIsViewModalOpen(true);
  };

  const onSubmitAdd = async (data: BuyerFormValues) => {
    setStatusMessage(null);
    try {
      const { error } = await supabase.from('export_buyers').insert([{
        name: data.name.trim(),
        contact_person: data.contact_person.trim(),
        email: data.email?.trim() || null,
        phone: data.phone?.trim() || null,
        country: data.country.trim(),
        address: data.address?.trim() || null,
        payment_terms: data.payment_terms?.trim() || 'Net 30 Days',
        notes: data.notes?.trim() || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }]);

      if (error) throw error;

      setStatusMessage({ type: 'success', text: `Buyer "${data.name}" added successfully!` });
      await fetchBuyers();

      setTimeout(() => {
        setIsAddModalOpen(false);
        setStatusMessage(null);
      }, 1200);

    } catch (err: any) {
      console.error('Error adding buyer:', err);
      setStatusMessage({ type: 'error', text: err.message || 'Failed to add buyer.' });
    }
  };

  const onSubmitEdit = async (data: BuyerFormValues) => {
    if (!selectedBuyer) return;
    setStatusMessage(null);
    try {
      const { error } = await supabase
        .from('export_buyers')
        .update({
          name: data.name.trim(),
          contact_person: data.contact_person.trim(),
          email: data.email?.trim() || null,
          phone: data.phone?.trim() || null,
          country: data.country.trim(),
          address: data.address?.trim() || null,
          payment_terms: data.payment_terms?.trim() || 'Net 30 Days',
          notes: data.notes?.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedBuyer.id);

      if (error) throw error;

      setStatusMessage({ type: 'success', text: `Buyer "${data.name}" updated successfully!` });
      await fetchBuyers();

      setTimeout(() => {
        setIsEditModalOpen(false);
        setStatusMessage(null);
      }, 1200);

    } catch (err: any) {
      console.error('Error updating buyer:', err);
      setStatusMessage({ type: 'error', text: err.message || 'Failed to update buyer.' });
    }
  };

  const handleDeleteBuyer = async (buyerId: string, buyerName: string) => {
    if (!window.confirm(`Are you sure you want to remove buyer "${buyerName}"?`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('export_buyers')
        .delete()
        .eq('id', buyerId);

      if (error) throw error;

      setBuyers(prev => prev.filter(b => b.id !== buyerId));
      if (selectedBuyer?.id === buyerId) {
        setIsViewModalOpen(false);
        setIsEditModalOpen(false);
      }
    } catch (err: any) {
      alert(`Could not delete buyer: ${err.message || 'This buyer has existing orders linked.'}`);
    }
  };

  const filteredBuyers = buyers.filter(b => {
    const q = searchTerm.toLowerCase();
    return b.name.toLowerCase().includes(q) ||
      (b.contact_person && b.contact_person.toLowerCase().includes(q)) ||
      (b.country && b.country.toLowerCase().includes(q)) ||
      (b.email && b.email.toLowerCase().includes(q));
  });

  const uniqueCountries = Array.from(new Set(buyers.map(b => b.country).filter(Boolean))).length;

  if (loading && buyers.length === 0) {
    return (
      <div className="p-12 flex flex-col items-center justify-center min-h-[400px]">
        <LoadingSpinner />
        <p className="text-secondary-text text-sm mt-3">Loading export buyers directory...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl border border-border shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center border border-blue-200">
            <Users size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-navy">Export Buyer & Customer Directory</h1>
            <p className="text-sm text-secondary-text">Manage global apparel brands, retail buyers, and commercial terms.</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRefresh} 
            disabled={refreshing}
            className="flex items-center gap-1.5"
          >
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </Button>

          <Button 
            className="flex items-center gap-1.5 bg-primary hover:bg-primary/90 text-white shadow-sm" 
            onClick={openAddModal}
          >
            <Plus size={16} /> Add New Buyer
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border border-border/80 shadow-xs">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase font-semibold tracking-wider text-secondary-text">Active Buyers</p>
              <h3 className="text-2xl font-bold text-navy mt-1">{buyers.length}</h3>
              <p className="text-xs text-emerald-600 font-medium mt-1">Verified global accounts</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Users size={24} />
            </div>
          </CardContent>
        </Card>

        <Card className="border border-border/80 shadow-xs">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase font-semibold tracking-wider text-secondary-text">Export Destination Markets</p>
              <h3 className="text-2xl font-bold text-navy mt-1">{uniqueCountries}</h3>
              <p className="text-xs text-secondary-text mt-1">Countries with active shipments</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <Globe size={24} />
            </div>
          </CardContent>
        </Card>

        <Card className="border border-border/80 shadow-xs">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase font-semibold tracking-wider text-secondary-text">Standard Commercial Terms</p>
              <h3 className="text-2xl font-bold text-emerald-700 mt-1">LC / Net 30-60</h3>
              <p className="text-xs text-secondary-text mt-1">Trade credit compliance</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CreditCard size={24} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Buyers Table Card */}
      <Card className="border border-border/80 shadow-xs">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <CardTitle className="text-lg text-navy">Registered Buyer Accounts</CardTitle>

            <div className="relative flex-1 sm:w-72">
              <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search by company, contact, country..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-sm rounded-lg border border-border bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {filteredBuyers.length === 0 ? (
            <div className="p-12 text-center">
              <EmptyState 
                title="No Buyers Found" 
                description="Add your first export buyer to link orders and manage shipments." 
                icon={Users} 
              />
              <Button className="mt-4" size="sm" onClick={openAddModal}>
                <Plus size={15} className="mr-1" /> Add First Buyer
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80">
                    <TableHead className="font-bold">Company / Brand</TableHead>
                    <TableHead className="font-bold">Primary Contact</TableHead>
                    <TableHead className="font-bold">Country & Market</TableHead>
                    <TableHead className="font-bold">Contact Channels</TableHead>
                    <TableHead className="font-bold">Payment Terms</TableHead>
                    <TableHead className="font-bold text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBuyers.map((buyer) => (
                    <TableRow key={buyer.id} className="hover:bg-slate-50/60 transition-colors">
                      <TableCell>
                        <div className="font-bold text-navy">{buyer.name}</div>
                        {buyer.address && (
                          <div className="text-xs text-secondary-text truncate max-w-[200px]">{buyer.address}</div>
                        )}
                      </TableCell>

                      <TableCell className="font-medium text-slate-800">
                        {buyer.contact_person || '—'}
                      </TableCell>

                      <TableCell>
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                          <Globe size={11} className="text-slate-500" />
                          {buyer.country || 'Global'}
                        </span>
                      </TableCell>

                      <TableCell className="text-xs space-y-0.5">
                        {buyer.email && (
                          <div className="flex items-center gap-1.5 text-slate-600">
                            <Mail size={12} className="text-slate-400" />
                            <span>{buyer.email}</span>
                          </div>
                        )}
                        {buyer.phone && (
                          <div className="flex items-center gap-1.5 text-slate-600">
                            <Phone size={12} className="text-slate-400" />
                            <span>{buyer.phone}</span>
                          </div>
                        )}
                      </TableCell>

                      <TableCell className="text-xs font-medium text-emerald-800">
                        <span className="px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200">
                          {buyer.payment_terms || 'LC at Sight'}
                        </span>
                      </TableCell>

                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button 
                            variant="outline" 
                            size="sm"
                            className="h-8 px-2 text-xs"
                            onClick={() => openViewModal(buyer)}
                            title="View Buyer Details"
                          >
                            <Eye size={13} className="mr-1" /> View
                          </Button>

                          <Button 
                            variant="outline" 
                            size="sm"
                            className="h-8 px-2 text-xs border-slate-300 text-slate-700 hover:bg-slate-100"
                            onClick={() => openEditModal(buyer)}
                            title="Edit Buyer"
                          >
                            <Edit3 size={13} className="mr-1" /> Edit
                          </Button>

                          <button 
                            type="button"
                            onClick={() => handleDeleteBuyer(buyer.id, buyer.name)}
                            className="p-1.5 text-slate-400 hover:text-red-600 rounded-md transition-colors"
                            title="Delete Buyer"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal 1: Add New Buyer */}
      <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Add New Export Buyer">
        {statusMessage && (
          <div className={`p-3.5 mb-4 rounded-xl text-sm flex items-start gap-2.5 ${
            statusMessage.type === 'success' 
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}>
            {statusMessage.type === 'success' ? (
              <CheckCircle2 size={18} className="text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle size={18} className="text-red-600 shrink-0 mt-0.5" />
            )}
            <div>
              <p className="font-semibold">{statusMessage.type === 'success' ? 'Success' : 'Error'}</p>
              <p className="text-xs mt-0.5">{statusMessage.text}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmitAdd)} className="space-y-4">
          <Input 
            id="buyer_name_add"
            label="Company / Brand Name *" 
            placeholder="e.g. H&M Hennes & Mauritz AB" 
            {...register('name')} 
            error={errors.name?.message} 
          />
          
          <div className="grid grid-cols-2 gap-3">
            <Input 
              id="buyer_contact_add"
              label="Contact Person *" 
              placeholder="e.g. Lars Lindqvist" 
              {...register('contact_person')} 
              error={errors.contact_person?.message} 
            />

            <Input 
              id="buyer_country_add"
              label="Country / Destination *" 
              placeholder="e.g. Sweden" 
              {...register('country')} 
              error={errors.country?.message} 
            />
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <Input 
              id="buyer_email_add"
              label="Email Address" 
              type="email" 
              placeholder="buyer@brand.com" 
              {...register('email')} 
              error={errors.email?.message} 
            />
            <Input 
              id="buyer_phone_add"
              label="Phone / WhatsApp" 
              placeholder="+46 8 796 5500" 
              {...register('phone')} 
              error={errors.phone?.message} 
            />
          </div>

          <Input 
            id="buyer_terms_add"
            label="Payment Terms" 
            placeholder="e.g. LC at Sight, Net 60 Days, 30% Advance" 
            {...register('payment_terms')} 
          />

          <Input 
            id="buyer_address_add"
            label="Corporate / Warehouse Address" 
            placeholder="e.g. Stockholm Global Distribution Center" 
            {...register('address')} 
          />

          <Input 
            id="buyer_notes_add"
            label="Notes & Quality Requirements" 
            placeholder="e.g. 4-point inspection requirement, Oeko-Tex certification required" 
            {...register('notes')} 
          />

          <div className="pt-4 flex justify-end gap-2.5 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setIsAddModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmitting} className="bg-primary hover:bg-primary/90 text-white">
              Save Buyer
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal 2: Edit Buyer */}
      <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title={`Edit Buyer: ${selectedBuyer?.name || ''}`}>
        {statusMessage && (
          <div className={`p-3.5 mb-4 rounded-xl text-sm flex items-start gap-2.5 ${
            statusMessage.type === 'success' 
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}>
            {statusMessage.type === 'success' ? (
              <CheckCircle2 size={18} className="text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle size={18} className="text-red-600 shrink-0 mt-0.5" />
            )}
            <div>
              <p className="font-semibold">{statusMessage.type === 'success' ? 'Success' : 'Error'}</p>
              <p className="text-xs mt-0.5">{statusMessage.text}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmitEdit)} className="space-y-4">
          <Input 
            id="buyer_name_edit"
            label="Company / Brand Name *" 
            {...register('name')} 
            error={errors.name?.message} 
          />
          
          <div className="grid grid-cols-2 gap-3">
            <Input 
              id="buyer_contact_edit"
              label="Contact Person *" 
              {...register('contact_person')} 
              error={errors.contact_person?.message} 
            />

            <Input 
              id="buyer_country_edit"
              label="Country / Destination *" 
              {...register('country')} 
              error={errors.country?.message} 
            />
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <Input 
              id="buyer_email_edit"
              label="Email Address" 
              type="email" 
              {...register('email')} 
            />
            <Input 
              id="buyer_phone_edit"
              label="Phone / WhatsApp" 
              {...register('phone')} 
            />
          </div>

          <Input 
            id="buyer_terms_edit"
            label="Payment Terms" 
            {...register('payment_terms')} 
          />

          <Input 
            id="buyer_address_edit"
            label="Corporate / Warehouse Address" 
            {...register('address')} 
          />

          <Input 
            id="buyer_notes_edit"
            label="Notes & Quality Requirements" 
            {...register('notes')} 
          />

          <div className="pt-4 flex justify-between items-center border-t border-border">
            <button
              type="button"
              onClick={() => selectedBuyer && handleDeleteBuyer(selectedBuyer.id, selectedBuyer.name)}
              className="text-xs text-red-600 hover:text-red-700 font-medium flex items-center gap-1"
            >
              <Trash2 size={14} /> Delete Buyer
            </button>

            <div className="flex gap-2.5">
              <Button type="button" variant="outline" onClick={() => setIsEditModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" isLoading={isSubmitting} className="bg-primary hover:bg-primary/90 text-white">
                Save Changes
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Modal 3: View Buyer Profile */}
      <Modal isOpen={isViewModalOpen} onClose={() => setIsViewModalOpen(false)} title="Buyer Profile & Specifications">
        {selectedBuyer && (
          <div className="space-y-4">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-xs uppercase font-semibold text-secondary-text">Company Name</span>
              <h3 className="text-xl font-bold text-navy mt-0.5">{selectedBuyer.name}</h3>
              <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                <Globe size={13} /> {selectedBuyer.country || 'International Export'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="p-3 bg-white rounded-lg border border-border">
                <span className="text-xs text-secondary-text block">Contact Person</span>
                <span className="font-semibold text-navy">{selectedBuyer.contact_person || '—'}</span>
              </div>

              <div className="p-3 bg-white rounded-lg border border-border">
                <span className="text-xs text-secondary-text block">Payment Terms</span>
                <span className="font-semibold text-emerald-700">{selectedBuyer.payment_terms || 'LC at Sight / Net 30'}</span>
              </div>

              <div className="p-3 bg-white rounded-lg border border-border">
                <span className="text-xs text-secondary-text block">Email</span>
                <span className="font-medium text-navy">{selectedBuyer.email || '—'}</span>
              </div>

              <div className="p-3 bg-white rounded-lg border border-border">
                <span className="text-xs text-secondary-text block">Phone / WhatsApp</span>
                <span className="font-medium text-navy">{selectedBuyer.phone || '—'}</span>
              </div>
            </div>

            {selectedBuyer.address && (
              <div className="p-3 bg-white rounded-lg border border-border text-xs">
                <span className="text-secondary-text block font-medium">Delivery Address:</span>
                <p className="text-navy font-semibold mt-0.5">{selectedBuyer.address}</p>
              </div>
            )}

            {selectedBuyer.notes && (
              <div className="p-3 bg-slate-50 rounded-lg text-xs text-secondary-text border border-slate-200">
                <strong className="text-navy">Buyer Notes & Standards:</strong> {selectedBuyer.notes}
              </div>
            )}

            <div className="pt-4 flex justify-end gap-2 border-t border-border">
              <Button variant="outline" onClick={() => setIsViewModalOpen(false)}>
                Close
              </Button>
              <Button 
                onClick={() => {
                  setIsViewModalOpen(false);
                  openEditModal(selectedBuyer);
                }}
                className="bg-primary hover:bg-primary/90 text-white"
              >
                <Edit3 size={14} className="mr-1.5" /> Edit Buyer
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
