const {PAGE1,PAGE2}=require('./dep0809');
// Synthetic joined heading with a sub-threshold advance between Eb and Chil.
const joined=PAGE2.replace(/<Glyphs\b[^>]*UnicodeString="(?:Eb|Chil)"[^>]*\/>/g,'')
 .replace('</FixedPage>','<Glyphs OriginX="542.88" OriginY="161" FontRenderingEmSize="10" UnicodeString="EbChil" Indices="0,55;0,116.2;0,55;0,55;0,55;0,55" /></FixedPage>');
module.exports={pages:[PAGE1,joined,PAGE2],baseline:[PAGE1,PAGE2,PAGE2]};
