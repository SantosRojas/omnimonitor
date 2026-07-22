import apiClient from "../api-client";

interface Equivalence {
  id: number;
  input_value: string;
  output_value: string;
}

export class HttpEquivalenceRepo {
  async list(): Promise<Equivalence[]> {
    const { data } = await apiClient.get<Equivalence[]>("/equivalences");
    return data;
  }

  async create(input: { input_value: string; output_value: string }): Promise<Equivalence> {
    const { data } = await apiClient.post<Equivalence>("/equivalences", input);
    return data;
  }

  async update(id: number, input: { input_value?: string; output_value?: string }): Promise<Equivalence> {
    const { data } = await apiClient.patch<Equivalence>(`/equivalences/${id}`, input);
    return data;
  }

  async delete(id: number): Promise<void> {
    await apiClient.delete(`/equivalences/${id}`);
  }
}
