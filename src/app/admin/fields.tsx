type Provider = {
  name?: string;
  websiteUrl?: string | null;
  affiliateUrl?: string | null;
  country?: string | null;
  isSponsor?: boolean;
};

export function ProviderFields({ p = {} }: { p?: Provider }) {
  return (
    <div className="grid2">
      <label>
        Name
        <input name="name" defaultValue={p.name} required maxLength={80} placeholder="Hetzner" />
      </label>
      <label>
        Country
        <input name="country" defaultValue={p.country ?? ""} maxLength={60} placeholder="Germany" />
      </label>
      <label>
        Website
        <input name="websiteUrl" type="url" defaultValue={p.websiteUrl ?? ""} placeholder="https://…" />
      </label>
      <label>
        Affiliate link
        <input name="affiliateUrl" type="url" defaultValue={p.affiliateUrl ?? ""} placeholder="https://… (optional)" />
      </label>
      <label className="check">
        <input name="isSponsor" type="checkbox" defaultChecked={p.isSponsor} />
        Sponsor (shown with a &ldquo;sponsor&rdquo; label everywhere)
      </label>
    </div>
  );
}

type Plan = {
  name?: string;
  vcpu?: number;
  ramGb?: number;
  diskGb?: number;
  diskType?: string | null;
  priceUsd?: number;
};

export function PlanFields({ p = {} }: { p?: Plan }) {
  return (
    <div className="grid6">
      <label className="wide">
        Plan name
        <input name="name" defaultValue={p.name} required maxLength={80} placeholder="CX22" />
      </label>
      <label>
        vCPU
        <input name="vcpu" type="number" min={1} step={1} defaultValue={p.vcpu} required />
      </label>
      <label>
        RAM (GB)
        <input name="ramGb" type="number" min={0.125} step="any" defaultValue={p.ramGb} required />
      </label>
      <label>
        Disk (GB)
        <input name="diskGb" type="number" min={1} step={1} defaultValue={p.diskGb} required />
      </label>
      <label>
        Disk type
        <input name="diskType" defaultValue={p.diskType ?? ""} maxLength={20} placeholder="NVMe" />
      </label>
      <label>
        Price (USD/mo)
        <input name="priceUsd" type="number" min={0} step="0.01" defaultValue={p.priceUsd} required />
      </label>
    </div>
  );
}
