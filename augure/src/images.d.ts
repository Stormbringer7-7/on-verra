// Images importées comme fichiers (assets) : Metro les remplace par un identifiant d'asset.
declare module '*.png' {
  const asset: number;
  export default asset;
}
