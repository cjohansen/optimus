(defproject optimus "0.20.2"
  :description "A Ring middleware for frontend performance optimization."
  :url "http://github.com/magnars/optimus"
  :license {:name "Eclipse Public License"
            :url  "http://www.eclipse.org/legal/epl-v10.html"}
  :dependencies [[org.clojure/clojure "1.8.0"]
                 [org.clojure/core.memoize "0.5.9"]
                 [org.clojure/data.codec "0.1.0"]
                 [org.clojure/java.data "0.1.4"]
                 [pathetic "0.5.1"]
                 [clj-time "0.12.0"]
                 [org.graalvm.js/js "19.2.0.1"]
                 [org.graalvm.js/js-scriptengine "19.2.0.1"]
                 [environ "1.1.0"]
                 [juxt/dirwatch "0.2.3"]
                 [potemkin "0.4.3"]
                 [com.cemerick/url "0.1.1"]]
  :profiles {:dev     {:dependencies   [[midje "1.9.9"]
                                        [optimus-test-jar "0.1.0"]
                                        [test-with-files "0.1.1"]]
                       :plugins        [[lein-midje "3.2.1"]
                                        [lein-shell "0.5.0"]
                                        [lein-environ "1.1.0"]]
                       :resource-paths ["test/resources"]
                       :source-paths   ["dev"]
                       :jvm-opts       ["-Djava.awt.headless=true"]}
             :rhino   {:dependencies [[cat.inspiracio/rhino-js-engine "1.7.10"]]
                       :env          {:optimus-js-engines "rhino"}}
             :nashorn {:env {:optimus-js-engines "nashorn"}}}
  :prep-tasks [["shell" "make"]])
