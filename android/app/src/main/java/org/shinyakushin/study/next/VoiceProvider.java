package org.shinyakushin.study.next;
public interface VoiceProvider extends AutoCloseable {
 byte[] render(String text,String speaker) throws Exception;
 String identity();
 /** Prepares resources without producing sound. Failure must never affect text. */
 default void warmup() throws Exception {}
 void close();
}
