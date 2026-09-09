#include <jni.h>
#include <voicevox_core.h>
#include <string>
#include <stdexcept>
#include <cstring>
struct Engine { VoicevoxSynthesizer* synth=nullptr; ~Engine(){if(synth)voicevox_synthesizer_delete(synth);} };
static void check(VoicevoxResultCode c){if(c!=VOICEVOX_RESULT_OK)throw std::runtime_error(voicevox_error_result_to_message(c));}
static std::string bytes(JNIEnv* e,jbyteArray a){jsize n=e->GetArrayLength(a);std::string s(n,'\0');e->GetByteArrayRegion(a,0,n,reinterpret_cast<jbyte*>(s.data()));if(s.find('\0')!=std::string::npos)throw std::runtime_error("NUL in input");return s;}
static void fail(JNIEnv* e,const std::exception& x){e->ThrowNew(e->FindClass("java/lang/IllegalStateException"),x.what());}
extern "C" JNIEXPORT jlong JNICALL Java_org_shinyakushin_study_next_VoicevoxProvider_create(JNIEnv* e,jclass,jbyteArray dict,jbyteArray runtime){
 Engine* engine=nullptr;OpenJtalkRc* jt=nullptr;
 try{if(std::strcmp(voicevox_get_version(),"0.17.0"))throw std::runtime_error("CORE version mismatch");auto d=bytes(e,dict),r=bytes(e,runtime);const VoicevoxOnnxruntime* ort=nullptr;auto load=voicevox_make_default_load_onnxruntime_options();load.filename=r.c_str();check(voicevox_onnxruntime_load_once(load,&ort));check(voicevox_open_jtalk_rc_new(d.c_str(),&jt));engine=new Engine();auto options=voicevox_make_default_initialize_options();options.acceleration_mode=VOICEVOX_ACCELERATION_MODE_CPU;options.cpu_num_threads=2;check(voicevox_synthesizer_new(ort,jt,options,&engine->synth));voicevox_open_jtalk_rc_delete(jt);return reinterpret_cast<jlong>(engine);}catch(const std::exception& x){if(jt)voicevox_open_jtalk_rc_delete(jt);delete engine;fail(e,x);return 0;}
}
extern "C" JNIEXPORT jstring JNICALL Java_org_shinyakushin_study_next_VoicevoxProvider_load(JNIEnv* e,jclass,jlong handle,jbyteArray path){
 VoicevoxVoiceModelFile* model=nullptr;char* meta=nullptr;
 try{auto p=bytes(e,path);check(voicevox_voice_model_file_open(p.c_str(),&model));meta=voicevox_voice_model_file_create_metas_json(model);check(voicevox_synthesizer_load_voice_model(reinterpret_cast<Engine*>(handle)->synth,model,voicevox_make_default_load_voice_model_options()));jstring result=e->NewStringUTF(meta);voicevox_json_free(meta);voicevox_voice_model_file_delete(model);return result;}catch(const std::exception& x){if(meta)voicevox_json_free(meta);if(model)voicevox_voice_model_file_delete(model);fail(e,x);return nullptr;}
}
extern "C" JNIEXPORT jbyteArray JNICALL Java_org_shinyakushin_study_next_VoicevoxProvider_synthesize(JNIEnv* e,jclass,jlong handle,jbyteArray text,jint style){
 uint8_t* wav=nullptr;uintptr_t size=0;
 try{auto t=bytes(e,text);check(voicevox_synthesizer_tts(reinterpret_cast<Engine*>(handle)->synth,t.c_str(),style,voicevox_make_default_tts_options(),&size,&wav));if(size>16000000)throw std::runtime_error("Voice output too large");auto result=e->NewByteArray(static_cast<jsize>(size));if(result)e->SetByteArrayRegion(result,0,size,reinterpret_cast<jbyte*>(wav));voicevox_wav_free(wav);return result;}catch(const std::exception& x){if(wav)voicevox_wav_free(wav);fail(e,x);return nullptr;}
}
extern "C" JNIEXPORT void JNICALL Java_org_shinyakushin_study_next_VoicevoxProvider_destroy(JNIEnv*,jclass,jlong handle){delete reinterpret_cast<Engine*>(handle);}
