export type Item = {
  id: string;
  name: string;
  qty: number;
};

export type Bin = {
  id: string;
  bin_number: string;
  notes: string;
  items: Item[];
  photo: string | null;
  updatedAt: string;
};
