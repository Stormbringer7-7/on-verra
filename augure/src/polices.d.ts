// Polices importées comme fichiers (assets/polices) : Metro les remplace par un identifiant d'asset.
declare module '*.woff2' {
  const asset: number;
  export default asset;
}
