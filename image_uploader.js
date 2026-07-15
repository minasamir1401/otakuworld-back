const { createClient } = require('@supabase/supabase-js');
const httpClient = require('./http_client');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_SECRET_KEY || '';
const BUCKET_NAME = 'anime-posters';

let supabaseClient = null;
let bucketVerified = false;

function getSupabase() {
  if (!SUPABASE_URL || !SUPABASE_URL.startsWith('http')) {
    return null;
  }
  if (!supabaseClient) {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);
  }
  return supabaseClient;
}

async function verifyBucket(supabase) {
  if (bucketVerified) return true;
  try {
    // Check if bucket exists, if not create it
    const { data: buckets, error: listErr } = await supabase.storage.listBuckets();
    if (listErr) {
      console.error('⚠️ [Supabase Storage] فشل في استعلام قائمة الباكيت:', listErr.message);
      return false;
    }
    const exists = buckets && buckets.some(b => b.name === BUCKET_NAME);
    if (!exists) {
      console.log(`[Supabase Storage] إنشاء الباكيت العامة الجديدة: "${BUCKET_NAME}"...`);
      const { error: createErr } = await supabase.storage.createBucket(BUCKET_NAME, {
        public: true,
        fileSizeLimit: 10485760 // 10MB
      });
      if (createErr && !createErr.message.includes('already exists')) {
        console.error('⚠️ [Supabase Storage] فشل في إنشاء الباكيت:', createErr.message);
        return false;
      }
    }
    bucketVerified = true;
    return true;
  } catch (err) {
    return false;
  }
}

async function uploadImageToSupabase(imageUrl, slug) {
  if (!imageUrl || typeof imageUrl !== 'string') return null;

  // If already hosted on Supabase, return immediately
  if (imageUrl.includes('supabase.co') || imageUrl.includes('supabase.in')) {
    return imageUrl;
  }

  const supabase = getSupabase();
  if (!supabase) {
    if (!uploadImageToSupabase._warned) {
      console.log(`ℹ️ [Supabase Storage] سيتم حفظ الرابط الأصلي للصورة لأن متغير SUPABASE_URL لم يتم إضافته في الإعدادات بعد.`);
      uploadImageToSupabase._warned = true;
    }
    return imageUrl;
  }

  try {
    const isBucketReady = await verifyBucket(supabase);
    if (!isBucketReady) return imageUrl;

    console.log(`📤 [Supabase Storage] جاري تحميل ورفع بوستر الأنمي (${slug}) إلى Supabase...`);

    // Download image using our proxy-aware http_client
    let imageBuffer;
    let contentType = 'image/jpeg';
    try {
      const response = await httpClient.get(imageUrl, { responseType: 'buffer', timeout: { request: 12000 } });
      imageBuffer = response.data;
      if (response.headers && response.headers['content-type']) {
        contentType = response.headers['content-type'];
      }
    } catch (downloadErr) {
      console.log(`⚠️ [Supabase Storage] تعذر تنزيل الصورة من المصدر (${imageUrl}): ${downloadErr.message}. سيتم الاحتفاظ بالرابط الأصلي.`);
      return imageUrl;
    }

    if (!imageBuffer || imageBuffer.length === 0) return imageUrl;

    // Determine extension
    let ext = '.jpg';
    if (contentType.includes('png')) ext = '.png';
    else if (contentType.includes('webp')) ext = '.webp';
    else if (contentType.includes('gif')) ext = '.gif';

    const cleanSlug = (slug || 'poster').replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    const fileName = `${cleanSlug}-${Date.now()}${ext}`;

    // Upload to storage
    const { data: uploadData, error: uploadErr } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(fileName, imageBuffer, {
        contentType: contentType,
        upsert: true
      });

    if (uploadErr) {
      console.error(`❌ [Supabase Storage] فشل في رفع الصورة: ${uploadErr.message}. سيتم حفظ الرابط الأصلي.`);
      return imageUrl;
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(fileName);

    if (urlData && urlData.publicUrl) {
      console.log(`✅ [Supabase Storage] تم رفع البوستر بنجاح: ${urlData.publicUrl}`);
      return urlData.publicUrl;
    }

    return imageUrl;
  } catch (error) {
    console.error(`⚠️ [Supabase Storage] حدث خطأ عام أثناء معالجة الصورة: ${error.message}`);
    return imageUrl;
  }
}

module.exports = {
  uploadImageToSupabase
};
