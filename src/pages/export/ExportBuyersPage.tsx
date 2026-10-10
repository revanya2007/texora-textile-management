import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { supabase } from '../../lib/supabase';
import { Card, CardContent } from '../../components/ui/Card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../../components/ui/Table';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { Users, Plus } from 'lucide-react';

interface Buyer {
  id: string;
  name: string;
  contact_person: string;
  email: string;
  phone: string;
  country: string;
  address: string;
}

const buyerSchema = z.object({
  name: z.string().min(1, 'Company Name is required'),
  contact_person: z.string().min(1, 'Contact Person is required'),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  phone: z.string().optional(),
  country: z.string().min(1, 'Country is required'),
  address: z.string().optional(),
});

type BuyerFormValues = z.infer<typeof buyerSchema>;

export default function ExportBuyersPage() {
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<BuyerFormValues>({
    resolver: zodResolver(buyerSchema),
  });

  const fetchBuyers = async () => {
    setLoading(true);
    const { data } = await supabase.from('export_buyers').select('*').order('name');
    if (data) setBuyers(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchBuyers();
  }, []);

  const onSubmit = async (data: BuyerFormValues) => {
    setFormError(null);
    try {
      const { error } = await supabase.from('export_buyers').insert([data]);
      if (error) throw error;
      
      setIsModalOpen(false);
      reset();
      fetchBuyers();
    } catch (err: any) {
      setFormError(err.message || 'Failed to create buyer.');
    }
  };

  if (loading && buyers.length === 0) return <div className="p-8 flex justify-center"><LoadingSpinner /></div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-navy">Buyers</h1>
          <p className="text-secondary-text">Manage your export clients and buyers.</p>
        </div>
        <Button className="flex items-center gap-2" onClick={() => setIsModalOpen(true)}>
          <Plus size={16} /> Add Buyer
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {buyers.length === 0 ? (
            <div className="p-8">
              <EmptyState title="No Buyers Found" description="Add your first export buyer to start managing orders." icon={Users} />
            </div>
          ) : (
             <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Company Name</TableHead>
                    <TableHead>Contact Person</TableHead>
                    <TableHead>Country</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {buyers.map((buyer) => (
                    <TableRow key={buyer.id}>
                      <TableCell className="font-medium">{buyer.name}</TableCell>
                      <TableCell>{buyer.contact_person}</TableCell>
                      <TableCell>{buyer.country}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm">View</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Add New Buyer">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {formError && (
            <div className="p-3 bg-red-50 border border-red-200 text-error text-sm rounded-md">
              {formError}
            </div>
          )}
          
          <Input 
            label="Company Name" 
            placeholder="e.g. Global Textiles Inc." 
            {...register('name')} 
            error={errors.name?.message} 
          />
          
          <Input 
            label="Contact Person" 
            placeholder="John Doe" 
            {...register('contact_person')} 
            error={errors.contact_person?.message} 
          />
          
          <div className="grid grid-cols-2 gap-4">
            <Input 
              label="Email (Optional)" 
              type="email" 
              placeholder="john@example.com" 
              {...register('email')} 
              error={errors.email?.message} 
            />
            <Input 
              label="Phone (Optional)" 
              placeholder="+1 234 567 8900" 
              {...register('phone')} 
              error={errors.phone?.message} 
            />
          </div>
          
          <Input 
            label="Country" 
            placeholder="e.g. United States" 
            {...register('country')} 
            error={errors.country?.message} 
          />
          
          <div className="space-y-1">
            <label className="text-sm font-medium text-navy block">Address (Optional)</label>
            <textarea 
              {...register('address')}
              className="w-full p-3 rounded-md border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-50 transition-colors"
              rows={3}
              placeholder="Full shipping/billing address..."
            />
          </div>

          <div className="pt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button type="submit" isLoading={isSubmitting}>Save Buyer</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
