package org.shinyakushin.study.next;
public interface VoiceProvider extends AutoCloseable {
 byte[] render(String text,String speaker) throws Exception;
 String identity();
 void close();
}
